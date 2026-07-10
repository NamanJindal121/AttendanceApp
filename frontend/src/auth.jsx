import { createContext, useContext, useEffect, useState } from "react";
import { pb } from "./pb";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(pb.authStore.record);

  useEffect(() => {
    // Reflect login/logout (and cross-tab changes) into React state.
    const unsub = pb.authStore.onChange(() => {
      setUser(pb.authStore.record);
    });

    // Sliding session: if we already have a stored token, silently refresh it
    // on load. This issues a new token (resetting its expiry) so an employee
    // who opens the app regularly never gets logged out.
    //
    // Only clear the token on a definitive auth failure (401 = expired/invalid).
    // We must NOT clear on:
    //   - request aborts (the SDK auto-cancels duplicate calls; React StrictMode
    //     fires this effect twice in dev, so the first refresh gets aborted), or
    //   - network errors (server down / offline) — logging out then would be wrong.
    // requestKey:null opts out of auto-cancellation so the double-invoke is safe.
    if (pb.authStore.isValid) {
      pb.collection("employees")
        .authRefresh({ requestKey: null })
        .catch((err) => {
          if (err?.status === 401) {
            pb.authStore.clear();
          }
        });
    }

    return unsub;
  }, []);

  const login = async (email, password) => {
    await pb.collection("employees").authWithPassword(email, password);
  };

  const logout = () => {
    pb.authStore.clear();
  };

  const isAdmin = !!user && user.role === "admin";

  return (
    <AuthContext.Provider value={{ user, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

import PocketBase from "pocketbase";

// Point the SDK at the current origin (absolute). An empty base URL makes the
// SDK build RELATIVE paths, which the browser resolves against the current
// route — e.g. from /login you'd get /login/api/... (404). Using the origin
// keeps it correct on every route. In dev, Vite proxies /api and /_ to
// PocketBase on :8090; in prod, Nginx proxies them on the same origin.
export const pb = new PocketBase(window.location.origin);

// Keep the SDK's auth store in sync across tabs.
pb.authStore.onChange(() => {}, false);

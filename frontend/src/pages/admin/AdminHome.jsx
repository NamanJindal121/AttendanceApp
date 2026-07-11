import { Routes, Route, Link, useLocation } from "react-router-dom";
import Employees from "./Employees";
import Report from "./Report";
import Settings from "./Settings";
import AttendanceCalendar from "./AttendanceCalendar";

export default function AdminHome() {
  const loc = useLocation();
  const tab = (path, label) => (
    <Link
      to={path}
      className={`tab ${loc.pathname === path ? "active" : ""}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="screen">
      <header className="topbar">
        <Link to="/" className="link">← App</Link>
        <div className="spacer" />
        <span>Admin</span>
      </header>
      <nav className="tabs">
        {tab("/admin", "Report")}
        {tab("/admin/calendar", "Calendar")}
        {tab("/admin/employees", "Employees")}
        {tab("/admin/settings", "Settings")}
      </nav>
      <Routes>
        <Route index element={<Report />} />
        <Route path="calendar" element={<AttendanceCalendar />} />
        <Route path="employees" element={<Employees />} />
        <Route path="settings" element={<Settings />} />
      </Routes>
    </div>
  );
}

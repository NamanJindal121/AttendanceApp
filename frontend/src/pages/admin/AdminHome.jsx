import { Routes, Route, Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  CalendarDays,
  Users,
  Settings as SettingsIcon,
} from "lucide-react";
import Employees from "./Employees";
import Report from "./Report";
import Settings from "./Settings";
import AttendanceCalendar from "./AttendanceCalendar";

export default function AdminHome() {
  const loc = useLocation();
  const tab = (path, label, Icon) => (
    <Link
      to={path}
      className={`tab ${loc.pathname === path ? "active" : ""}`}
    >
      <Icon /> {label}
    </Link>
  );

  return (
    <div className="screen">
      <header className="topbar">
        <Link to="/" className="link">
          <ArrowLeft /> <span className="label">App</span>
        </Link>
        <div className="spacer" />
        <span className="brand">Admin</span>
      </header>
      <nav className="tabs">
        {tab("/admin", "Report", FileText)}
        {tab("/admin/calendar", "Calendar", CalendarDays)}
        {tab("/admin/employees", "Employees", Users)}
        {tab("/admin/settings", "Settings", SettingsIcon)}
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

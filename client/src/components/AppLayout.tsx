import { Outlet, NavLink } from "react-router-dom";
import { LayoutList, AlertTriangle, Settings, Activity } from "lucide-react";

export default function AppLayout() {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? "bg-slate-800 text-white"
        : "text-slate-300 hover:bg-slate-700 hover:text-white"
    }`;

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-400" />
            <span className="font-bold text-white text-sm">PLO</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Project Lifecycle</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavLink to="/" end className={navClass}>
            <LayoutList className="h-4 w-4" />
            Projets
          </NavLink>
          <NavLink to="/anomalies" className={navClass}>
            <AlertTriangle className="h-4 w-4" />
            Anomalies
          </NavLink>
          <NavLink to="/rules" className={navClass}>
            <Settings className="h-4 w-4" />
            Règles
          </NavLink>
        </nav>

        <div className="px-4 py-3 border-t border-slate-700">
          <p className="text-xs text-slate-500">v1.0 — Sprint 4</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

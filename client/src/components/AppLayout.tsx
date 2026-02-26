import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutList, AlertTriangle, Settings, Activity, BarChart2, LogOut, Users, UserCircle2, ClipboardList, Search } from "lucide-react";
import { useCurrentUser, useLogout } from "../lib/api.ts";
import NotificationBell from "./NotificationBell.tsx";
import GlobalSearch from "./GlobalSearch.tsx";

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin: "bg-purple-900 text-purple-300",
    coordinator: "bg-blue-900 text-blue-300",
    viewer: "bg-slate-700 text-slate-400",
  };
  const labels: Record<string, string> = {
    admin: "Admin",
    coordinator: "Coordinateur",
    viewer: "Lecteur",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${styles[role] ?? styles.viewer}`}>
      {labels[role] ?? role}
    </span>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const { data: meData } = useCurrentUser();
  const logout = useLogout();
  const user = meData?.user;
  const [searchOpen, setSearchOpen] = useState(false);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? "bg-slate-800 text-white"
        : "text-slate-300 hover:bg-slate-700 hover:text-white"
    }`;

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => void navigate("/login", { replace: true }),
    });
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Global search overlay */}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}

      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-400" />
              <span className="font-bold text-white text-sm">PLO</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSearchOpen(true)}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                title="Recherche globale (⌘K)"
                aria-label="Recherche globale"
              >
                <Search className="h-4 w-4" />
              </button>
              <NotificationBell />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Project Lifecycle</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavLink to="/dashboard" className={navClass}>
            <BarChart2 className="h-4 w-4" />
            Dashboard
          </NavLink>
          <NavLink to="/customers" className={navClass}>
            <UserCircle2 className="h-4 w-4" />
            Clients
          </NavLink>
          <NavLink to="/" end className={navClass}>
            <LayoutList className="h-4 w-4" />
            Projets
          </NavLink>
          <NavLink to="/anomalies" className={navClass}>
            <AlertTriangle className="h-4 w-4" />
            Anomalies
          </NavLink>
          <NavLink to="/activity" className={navClass}>
            <ClipboardList className="h-4 w-4" />
            Journal
          </NavLink>
          <NavLink to="/rules" className={navClass}>
            <Settings className="h-4 w-4" />
            Règles
          </NavLink>
          {user?.role === "admin" && (
            <NavLink to="/users" className={navClass}>
              <Users className="h-4 w-4" />
              Utilisateurs
            </NavLink>
          )}
        </nav>

        {/* User info + logout */}
        <div className="px-3 py-3 border-t border-slate-700 space-y-2">
          {user && (
            <div className="px-1 space-y-1">
              <p className="text-xs text-white font-medium truncate">{user.name}</p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
              <RoleBadge role={user.role} />
            </div>
          )}
          <button
            onClick={handleLogout}
            disabled={logout.isPending}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm
                       text-slate-400 hover:bg-slate-700 hover:text-white transition-colors
                       disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {logout.isPending ? "Déconnexion…" : "Déconnexion"}
          </button>
          <p className="text-xs text-slate-600 px-1">v1.0 — Sprint 18</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

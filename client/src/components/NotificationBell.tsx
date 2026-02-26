import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useSSENotifications } from "../lib/api.ts";
import type { SseNotificationPayload } from "../lib/api.ts";

function SeverityDot({ severity }: { severity: string }) {
  const cls =
    severity === "critical"
      ? "bg-red-500"
      : severity === "warning"
      ? "bg-orange-400"
      : "bg-slate-400";
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls}`} />;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllRead } = useSSENotifications();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fermer au clic en dehors
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggle = () => {
    setOpen((prev) => !prev);
    if (!open) markAllRead();
  };

  const handleNotifClick = (notif: SseNotificationPayload) => {
    setOpen(false);
    void navigate(`/projects/${notif.project_id}`);
  };

  const recent = notifications.slice(0, 10);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={toggle}
        className="relative p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">Notifications temps réel</p>
          </div>

          {recent.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              Aucune notification récente
            </div>
          ) : (
            <ul className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
              {recent.map((notif) => (
                <li
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <SeverityDot severity={notif.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">
                      {notif.rule_name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {notif.project_customer_id}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {new Date(notif.sent_at).toLocaleString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="px-4 py-2.5 border-t border-slate-100">
            <button
              onClick={() => { setOpen(false); void navigate("/anomalies"); }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Voir toutes les anomalies →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

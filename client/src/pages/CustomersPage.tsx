import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCustomers } from "../lib/api.ts";
import SeverityBadge from "../components/SeverityBadge.tsx";
import { formatDate } from "../lib/utils.ts";
import { RefreshCw, Search } from "lucide-react";

export default function CustomersPage() {
  const navigate = useNavigate();
  const [rawQ, setRawQ] = useState("");
  const [q, setQ] = useState<string | undefined>(undefined);

  // Debounce 300ms
  useEffect(() => {
    const t = setTimeout(() => setQ(rawQ.trim() || undefined), 300);
    return () => clearTimeout(t);
  }, [rawQ]);

  const { data, isLoading, error, refetch, isFetching } = useCustomers(q);
  const customers = data?.customers ?? [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {customers.length} client{customers.length > 1 ? "s" : ""} trouvé{customers.length > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 border border-slate-200 rounded px-3 py-1.5"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5 w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={rawQ}
          onChange={(e) => setRawQ(e.target.value)}
          placeholder="Rechercher un client…"
          className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Chargement...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">
          Erreur : {error.message}
        </div>
      ) : customers.length === 0 ? (
        <div className="text-center py-12 text-slate-400">Aucun client trouvé</div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Projets</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Sévérité</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Anomalies actives</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Dernier événement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((customer) => (
                <tr
                  key={customer.customer_id}
                  onClick={() => void navigate(`/customers/${encodeURIComponent(customer.customer_id)}`)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{customer.customer_id}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="font-medium">{customer.active_project_count}</span>
                    <span className="text-slate-400"> / {customer.project_count}</span>
                    <span className="text-xs text-slate-400 ml-1">actifs</span>
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={customer.anomaly_severity} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {customer.active_anomaly_count > 0 ? (
                      <span className="font-semibold text-red-600">{customer.active_anomaly_count}</span>
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {formatDate(customer.last_event_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

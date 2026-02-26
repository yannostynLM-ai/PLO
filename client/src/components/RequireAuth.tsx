// =============================================================================
// RequireAuth — Sprint 9
// Garde de route : vérifie la session JWT via GET /api/auth/me
// Non authentifié → redirect /login (replace pour éviter le retour arrière)
// En cours de vérification → spinner (évite le flash de contenu)
// =============================================================================

import { Navigate, Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useCurrentUser } from "../lib/api.ts";

export default function RequireAuth() {
  const { isLoading, isError } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

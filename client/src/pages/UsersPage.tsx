import { useState } from "react";
import { X, Plus, Pencil, KeyRound, Trash2 } from "lucide-react";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useResetPassword,
  useCurrentUser,
  type UserSummary,
} from "../lib/api.ts";

// =============================================================================
// Composant Badge rôle
// =============================================================================

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin: "bg-purple-100 text-purple-700",
    coordinator: "bg-blue-100 text-blue-700",
    viewer: "bg-slate-100 text-slate-500",
  };
  const labels: Record<string, string> = {
    admin: "Admin",
    coordinator: "Coordinateur",
    viewer: "Lecteur",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[role] ?? styles.viewer}`}>
      {labels[role] ?? role}
    </span>
  );
}

// =============================================================================
// Modal Création / Édition utilisateur
// =============================================================================

interface UserFormModalProps {
  user?: UserSummary; // undefined → création
  currentUserId: string;
  onClose: () => void;
}

function UserFormModal({ user, currentUserId, onClose }: UserFormModalProps) {
  const isEdit = Boolean(user);
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user?.role ?? "viewer");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const isPending = createUser.isPending || updateUser.isPending;

  const isSelf = user?.id === currentUserId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      if (isEdit && user) {
        await updateUser.mutateAsync({ id: user.id, name, role });
      } else {
        await createUser.mutateAsync({ email, name, password, role });
      }
      setSuccess(true);
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-slate-800">
            {isEdit ? "Modifier l'utilisateur" : "Nouvel utilisateur"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="px-5 py-4 space-y-4">
          {/* Email — seulement en création */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          )}

          {/* Nom */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Nom *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Mot de passe — seulement en création */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Mot de passe * (min. 8 caractères)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          )}

          {/* Rôle */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Rôle
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={isSelf}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="viewer">Lecteur</option>
              <option value="coordinator">Coordinateur</option>
              <option value="admin">Admin</option>
            </select>
            {isSelf && (
              <p className="text-xs text-slate-400 mt-1">Vous ne pouvez pas modifier votre propre rôle.</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">
              {isEdit ? "Utilisateur mis à jour" : "Utilisateur créé avec succès"}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isPending || success}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? "Enregistrement..." : isEdit ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// Modal Réinitialisation mot de passe
// =============================================================================

interface ResetPasswordModalProps {
  user: UserSummary;
  onClose: () => void;
}

function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resetPwd = useResetPassword();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }

    try {
      await resetPwd.mutateAsync({ id: user.id, password });
      setSuccess(true);
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-slate-800">
            Réinitialiser le mot de passe
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="px-5 py-4 space-y-4">
          <p className="text-sm text-slate-500">
            Nouveau mot de passe pour <strong>{user.name}</strong> ({user.email})
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Nouveau mot de passe *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Minimum 8 caractères"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Confirmer le mot de passe *
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              placeholder="Répéter le mot de passe"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">
              Mot de passe réinitialisé avec succès
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={resetPwd.isPending || success}
              className="px-4 py-2 text-sm rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {resetPwd.isPending ? "Réinitialisation..." : "Réinitialiser"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// Ligne de la table avec confirm suppression inline
// =============================================================================

interface UserRowProps {
  user: UserSummary;
  currentUserId: string;
  onEdit: (u: UserSummary) => void;
  onResetPwd: (u: UserSummary) => void;
}

function UserRow({ user, currentUserId, onEdit, onResetPwd }: UserRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteUser = useDeleteUser();
  const isSelf = user.id === currentUserId;

  const handleDelete = () => {
    deleteUser.mutate(user.id, {
      onError: (err) => alert(err instanceof Error ? err.message : "Erreur lors de la suppression"),
    });
  };

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-slate-800">{user.name}</td>
      <td className="px-4 py-3 text-sm text-slate-500">{user.email}</td>
      <td className="px-4 py-3">
        <RoleBadge role={user.role} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {/* Éditer */}
          <button
            onClick={() => onEdit(user)}
            title="Modifier"
            className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Pencil className="h-4 w-4" />
          </button>

          {/* Réinitialiser mot de passe */}
          <button
            onClick={() => onResetPwd(user)}
            title="Réinitialiser le mot de passe"
            className="p-1.5 rounded text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
          >
            <KeyRound className="h-4 w-4" />
          </button>

          {/* Supprimer */}
          {isSelf ? (
            <button
              disabled
              title="Vous ne pouvez pas supprimer votre propre compte"
              className="p-1.5 rounded text-slate-200 cursor-not-allowed"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : confirmDelete ? (
            <span className="flex items-center gap-1 text-xs">
              <button
                onClick={handleDelete}
                disabled={deleteUser.isPending}
                className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700 disabled:opacity-50"
              >
                {deleteUser.isPending ? "..." : "Oui"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded border border-slate-200 text-slate-600 text-xs hover:bg-slate-50"
              >
                Annuler
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Supprimer"
              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// =============================================================================
// Page principale UsersPage
// =============================================================================

export default function UsersPage() {
  const { data, isLoading, isError } = useUsers();
  const { data: meData } = useCurrentUser();
  const currentUserId = meData?.user.id ?? "";

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserSummary | null>(null);
  const [resetPwdUser, setResetPwdUser] = useState<UserSummary | null>(null);

  const users = data?.users ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Utilisateurs{" "}
            {!isLoading && (
              <span className="text-slate-400 font-normal text-base">({users.length})</span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestion des opérateurs PLO</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nouvel utilisateur
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading && (
          <div className="px-4 py-8 text-center text-sm text-slate-400">Chargement...</div>
        )}
        {isError && (
          <div className="px-4 py-8 text-center text-sm text-red-500">
            Erreur lors du chargement des utilisateurs
          </div>
        )}
        {!isLoading && !isError && (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Nom
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Rôle
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  currentUserId={currentUserId}
                  onEdit={(usr) => setEditUser(usr)}
                  onResetPwd={(usr) => setResetPwdUser(usr)}
                />
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                    Aucun utilisateur trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <UserFormModal
          currentUserId={currentUserId}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editUser && (
        <UserFormModal
          user={editUser}
          currentUserId={currentUserId}
          onClose={() => setEditUser(null)}
        />
      )}
      {resetPwdUser && (
        <ResetPasswordModal
          user={resetPwdUser}
          onClose={() => setResetPwdUser(null)}
        />
      )}
    </div>
  );
}

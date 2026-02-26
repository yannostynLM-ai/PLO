import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FolderOpen, UserCircle2, Settings, Clock, Loader2 } from "lucide-react";
import { useSearch, type SearchResult } from "../lib/api.ts";

// =============================================================================
// GlobalSearch — Overlay Spotlight (Sprint 17)
// Cmd+K pour ouvrir depuis n'importe quelle page
// =============================================================================

const HISTORY_KEY = "plo_search_history";
const MAX_HISTORY = 5;

function getHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function addToHistory(q: string): void {
  if (!q.trim()) return;
  const prev = getHistory().filter((h) => h !== q);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([q, ...prev].slice(0, MAX_HISTORY)));
}

const TYPE_LABELS: Record<string, string> = {
  project:  "Projets",
  customer: "Clients",
  rule:     "Règles",
};

const TYPE_ORDER: Array<"project" | "customer" | "rule"> = ["project", "customer", "rule"];

function ResultIcon({ type }: { type: SearchResult["type"] }) {
  if (type === "project")  return <FolderOpen className="h-4 w-4 text-blue-500 flex-shrink-0" />;
  if (type === "customer") return <UserCircle2 className="h-4 w-4 text-purple-500 flex-shrink-0" />;
  return <Settings className="h-4 w-4 text-slate-500 flex-shrink-0" />;
}

/** Met en gras la portion du texte qui correspond à q */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q || q.length < 2) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-slate-900">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

interface Props {
  onClose: () => void;
}

export default function GlobalSearch({ onClose }: Props) {
  const navigate = useNavigate();
  const [rawQ, setRawQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce 250ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(rawQ.trim()), 250);
    return () => clearTimeout(t);
  }, [rawQ]);

  // Reset activeIdx lorsque les résultats changent
  useEffect(() => { setActiveIdx(-1); }, [debouncedQ]);

  const { data, isFetching } = useSearch(debouncedQ);
  const results = data?.results ?? [];

  // Groupement par type dans l'ordre défini
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: results.filter((r) => r.type === type),
  })).filter((g) => g.items.length > 0);

  // Liste plate pour navigation clavier
  const flat = grouped.flatMap((g) => g.items);

  // Historique affiché quand input vide
  const history = getHistory();
  const showHistory = rawQ.trim().length === 0 && history.length > 0;
  const showEmpty = debouncedQ.length >= 2 && !isFetching && results.length === 0;

  const navigate_ = useCallback(
    (path: string, query: string) => {
      addToHistory(query || rawQ);
      onClose();
      void navigate(path);
    },
    [navigate, onClose, rawQ]
  );

  const handleResultClick = (result: SearchResult) => {
    navigate_(result.path, result.label);
  };

  const handleHistoryClick = (q: string) => {
    setRawQ(q);
    setDebouncedQ(q);
    inputRef.current?.focus();
  };

  // Navigation clavier
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (flat.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter" && activeIdx >= 0 && flat[activeIdx]) {
      e.preventDefault();
      const result = flat[activeIdx];
      if (result) handleResultClick(result);
    }
  };

  // Focus auto à l'ouverture
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    // Fond semi-transparent
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-24 px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200"
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          {isFetching ? (
            <Loader2 className="h-5 w-5 text-slate-400 flex-shrink-0 animate-spin" />
          ) : (
            <Search className="h-5 w-5 text-slate-400 flex-shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={rawQ}
            onChange={(e) => setRawQ(e.target.value)}
            placeholder="Rechercher un projet, client, règle…"
            className="flex-1 text-sm text-slate-900 placeholder-slate-400 outline-none bg-transparent"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs text-slate-400 border border-slate-200 rounded">
            Esc
          </kbd>
        </div>

        {/* Historique (input vide) */}
        {showHistory && (
          <div className="py-2">
            <p className="px-4 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Recherches récentes
            </p>
            {history.map((h) => (
              <button
                key={h}
                onClick={() => handleHistoryClick(h)}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
              >
                <Clock className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-700">{h}</span>
              </button>
            ))}
          </div>
        )}

        {/* Résultats groupés */}
        {grouped.length > 0 && (
          <div className="py-2 max-h-96 overflow-y-auto">
            {grouped.map((group) => (
              <div key={group.type}>
                <p className="px-4 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  {TYPE_LABELS[group.type]}
                </p>
                {group.items.map((result) => {
                  const idx = flat.indexOf(result);
                  const isActive = idx === activeIdx;
                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleResultClick(result)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                        isActive ? "bg-blue-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <ResultIcon type={result.type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 truncate">
                          <Highlight text={result.label} q={debouncedQ} />
                        </p>
                        {result.sublabel && (
                          <p className="text-xs text-slate-400 truncate">{result.sublabel}</p>
                        )}
                      </div>
                      {isActive && (
                        <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs text-slate-400 border border-slate-200 rounded flex-shrink-0">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Aucun résultat */}
        {showEmpty && (
          <div className="py-10 text-center text-sm text-slate-400">
            Aucun résultat pour «&nbsp;{debouncedQ}&nbsp;»
          </div>
        )}

        {/* Footer hint */}
        {!showHistory && grouped.length === 0 && !showEmpty && rawQ.trim().length < 2 && (
          <div className="px-4 py-3 text-xs text-slate-400 text-center border-t border-slate-100">
            Tapez au moins 2 caractères pour lancer la recherche
          </div>
        )}
      </div>
    </div>
  );
}

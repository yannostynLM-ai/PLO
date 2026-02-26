import { ChevronLeft, ChevronRight } from "lucide-react";

// =============================================================================
// Pagination — Composant réutilisable (Sprint 19)
// Usage : <Pagination page={page} pages={pages} total={total} label="projet" onPage={goToPage} />
// =============================================================================

interface PaginationProps {
  page:   number;
  pages:  number;
  total:  number;
  label:  string;   // ex: "projet", "anomalie" — pluralisé automatiquement
  onPage: (p: number) => void;
}

const MAX_CHIPS = 7;

export default function Pagination({ page, pages, total, label, onPage }: PaginationProps) {
  const plural = total > 1 ? "s" : "";

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-white">
      <span className="text-xs text-slate-500">
        {total} {label}{plural} — page {page} sur {pages}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Page précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pages <= MAX_CHIPS
          ? Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => onPage(p)}
                className={`min-w-[28px] h-7 text-xs rounded transition-colors ${
                  p === page
                    ? "bg-slate-800 text-white font-medium"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p}
              </button>
            ))
          : (
              <span className="text-xs text-slate-500 px-2">{page} / {pages}</span>
            )
        }

        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

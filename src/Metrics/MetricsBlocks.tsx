import type { LucideIcon } from "lucide-react";
import type { CountRow } from "./Services/Metrics.adapter";

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
export function KPICard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <div className="bg-base-100 border border-base-content/5 rounded-2xl p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest opacity-40">
          {label}
        </span>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${accent}18` }}
        >
          <Icon size={18} style={{ color: accent }} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-black leading-none text-base-content">
          {value}
        </span>
        {sub && <span className="text-xs opacity-40 mb-0.5">{sub}</span>}
      </div>
    </div>
  );
}

// ─── RANKING (proveedor / operador) ───────────────────────────────────────────
export function CountList({
  title,
  rows,
  accent,
}: {
  title: string;
  rows: CountRow[];
  accent: string;
}) {
  const max = rows[0]?.tours ?? 1;

  return (
    <div className="bg-base-100 border border-base-content/5 rounded-2xl p-5">
      <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-4">
        {title}
      </h2>

      {rows.length === 0 ? (
        <p className="text-xs opacity-40">Todavía no hay tours hechos.</p>
      ) : (
        <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto pr-1">
          {rows.map((row) => (
            <div key={row.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs truncate opacity-70">{row.name}</span>
                <span className="text-xs font-bold shrink-0">
                  {row.tours} {row.tours === 1 ? "tour" : "tours"}
                </span>
              </div>
              <div className="h-1.5 bg-base-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round((row.tours / max) * 100)}%`,
                    background: accent,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
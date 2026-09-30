import type { LucideIcon } from "lucide-react";

// ─── FORMATEADORES ────────────────────────────────────────────────────────────
const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

export function formatEuro(n: number): string {
  return eur.format(n);
}

// "2026-10" → "octubre de 2026"
export function formatMonth(m: string): string {
  const [y, mon] = m.split("-");
  return new Date(parseInt(y), parseInt(mon) - 1, 1).toLocaleDateString(
    "es-ES",
    { month: "long", year: "numeric" },
  );
}

// Últimos 12 meses, el más reciente primero: ["2026-10", "2026-09", ...]
export function generateMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return months;
}

// "2026-09-04" → "4 sept 2026"
export function formatEntryDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    .replace(/\.$/, "")
    .replace(/\. /, " ");
}

// ─── CLASES DE CABECERA DE TABLA ──────────────────────────────────────────────
export const TH_LEFT =
  "text-left py-2 px-4 text-xs font-bold opacity-40 uppercase tracking-wider";
export const TH_RIGHT =
  "text-right py-2 px-4 text-xs font-bold opacity-40 uppercase tracking-wider";

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
export function KPICard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="bg-base-100 border border-base-content/10 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest opacity-40">
          {label}
        </span>
        <div className="w-9 h-9 rounded-xl bg-base-content/5 flex items-center justify-center">
          <Icon size={18} className="opacity-50" />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-black leading-none">{value}</span>
        {sub && <span className="text-xs opacity-40 mb-0.5">{sub}</span>}
      </div>
    </div>
  );
}

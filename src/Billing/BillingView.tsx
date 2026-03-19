import { useState, useEffect, useMemo } from "react";
import { Download, Euro, Users, Calendar, ChevronDown, Pencil, Check, X } from "lucide-react";
import { useAuth } from "../login/AuthContext";
import {
  useBillingData, updateGuideCredits, fetchAllGuides,
  getCostForReservation, getCreditsForReservation,
  type GuideProfile, type BillingTour, type BillingReservation,
} from "./useBillingData";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const PLATFORM_LABELS: Record<string, string> = {
  guruwalk: "GuruWalk", freetour: "FreeTour",
  turixe: "Turixe",     tripadvisor: "TripAdvisor",
};

function formatMonth(m: string): string {
  const [y, mon] = m.split("-");
  return new Date(parseInt(y), parseInt(mon) - 1, 1)
    .toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

function generateMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, icon: Icon }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType;
}) {
  return (
    <div className="bg-base-100 border border-base-content/10 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest opacity-40">{label}</span>
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

// ─── CRÉDITOS EDITABLES ───────────────────────────────────────────────────────
function CreditsEditor({ guideId, platform, initial, consumed }: {
  guideId:  string;
  platform: string;
  initial:  number;
  consumed: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(initial);
  const [saving,  setSaving]  = useState(false);
  const remaining = value - consumed;

  const handleSave = async () => {
    setSaving(true);
    await updateGuideCredits(guideId, platform, value);
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold opacity-50 uppercase tracking-wider">
          {PLATFORM_LABELS[platform] ?? platform}
        </span>
        {!editing && (
          <button onClick={() => setEditing(true)} className="btn btn-ghost btn-xs btn-circle opacity-30 hover:opacity-70">
            <Pencil size={11} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="input input-sm input-bordered w-24 text-sm"
              min={0}
            />
            <button onClick={handleSave} disabled={saving} className="btn btn-xs bg-base-content text-base-100 border-none">
              {saving ? <span className="loading loading-spinner loading-xs" /> : <Check size={12} />}
            </button>
            <button onClick={() => setEditing(false)} className="btn btn-xs btn-ghost opacity-40">
              <X size={12} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="font-bold">{value} créditos</span>
            <span className="opacity-40">−{consumed} consumidos</span>
            <span className={`font-semibold ${remaining < 0 ? "text-error" : "text-success"}`}>
              = {remaining} restantes
            </span>
          </div>
        )}
      </div>

      <div className="h-1.5 bg-base-200 rounded-full overflow-hidden mt-1">
        <div
          className={`h-full rounded-full transition-all ${remaining < 0 ? "bg-error" : "bg-success"}`}
          style={{ width: `${Math.min(100, value > 0 ? (consumed / value) * 100 : 0)}%` }}
        />
      </div>
    </div>
  );
}

// ─── EXPORTAR CSV/EXCEL ───────────────────────────────────────────────────────
function exportToExcel(guide: GuideProfile, month: string, tours: BillingTour[]) {
  const rows: string[][] = [];

  rows.push([`Informe de Facturación — ${guide.name}`]);
  rows.push([`Período: ${formatMonth(month)}`]);
  rows.push([`Generado: ${new Date().toLocaleDateString("es-ES")}`]);
  rows.push([]);
  rows.push(["Fecha", "Tour", "Horario", "Adultos", "Niños", "Reservas", "Plataforma", "Coste (€)"]);

  for (const tour of tours) {
    const guideRes = tour.reservations.filter((r: BillingReservation) => r.attended);
    for (const res of guideRes) {
      const cost = getCostForReservation(res.platform, res.adults);
      rows.push([
        new Date(tour.date).toLocaleDateString("es-ES"),
        tour.title,
        tour.time.slice(0, 5),
        String(res.adults),
        String(res.children),
        "1",
        PLATFORM_LABELS[res.platform] ?? res.platform,
        cost.toFixed(2),
      ]);
    }
  }

  const allRes = tours.flatMap((t: BillingTour) => t.reservations.filter((r: BillingReservation) => r.attended));
  const totalAdults   = allRes.reduce((a: number, r: BillingReservation) => a + r.adults, 0);
  const totalChildren = allRes.reduce((a: number, r: BillingReservation) => a + r.children, 0);
  const totalCost     = allRes.reduce((a: number, r: BillingReservation) => a + getCostForReservation(r.platform, r.adults), 0);

  rows.push([]);
  rows.push(["TOTALES"]);
  rows.push(["Total adultos",  String(totalAdults)]);
  rows.push(["Total niños",    String(totalChildren)]);
  rows.push(["Total invertido", `€${totalCost.toFixed(2)}`]);

  rows.push([]);
  rows.push(["Desglose por plataforma"]);
  rows.push(["Plataforma", "Adultos", "Créditos consumidos", "Coste (€)"]);

  const platforms = [...new Set(allRes.map((r: BillingReservation) => r.platform))];
  for (const plat of platforms) {
    const platRes = allRes.filter((r: BillingReservation) => r.platform === plat);
    const adults  = platRes.reduce((a: number, r: BillingReservation) => a + r.adults, 0);
    const credits = platRes.reduce((a: number, r: BillingReservation) => a + getCreditsForReservation(r.platform, r.adults), 0);
    const cost    = platRes.reduce((a: number, r: BillingReservation) => a + getCostForReservation(r.platform, r.adults), 0);
    rows.push([PLATFORM_LABELS[plat] ?? plat, String(adults), String(credits), `€${cost.toFixed(2)}`]);
  }

  const csv  = rows.map((r) => r.map((cell) => `"${cell}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `facturacion_${guide.name.replace(/\s+/g, "_")}_${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function BillingView() {
  const { profile, isAdmin } = useAuth();

  const months = generateMonths();
  const [month,           setMonth]           = useState(months[0]);
  const [guides,          setGuides]          = useState<GuideProfile[]>([]);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      fetchAllGuides().then((g) => {
        setGuides(g);
        if (g.length > 0) setSelectedGuideId(g[0].id);
      });
    } else {
      setSelectedGuideId(profile?.id ?? null);
    }
  }, [isAdmin, profile]);

  const activeGuideId = isAdmin ? selectedGuideId : (profile?.id ?? null);
  const activeGuide: GuideProfile | undefined = isAdmin
    ? guides.find((g) => g.id === activeGuideId)
    : profile
    ? { id: profile.id, name: profile.name, email: profile.email, avatar_url: profile.avatar_url ?? null }
    : undefined;

  const { tours, credits, loading } = useBillingData(activeGuideId, month);

  const allConfirmedRes = useMemo(
    () => tours.flatMap((t: BillingTour) => t.reservations.filter((r: BillingReservation) => r.attended)),
    [tours]
  );

  const totalAdults   = allConfirmedRes.reduce((a: number, r: BillingReservation) => a + r.adults, 0);
  const totalChildren = allConfirmedRes.reduce((a: number, r: BillingReservation) => a + r.children, 0);
  const totalCost     = allConfirmedRes.reduce((a: number, r: BillingReservation) => a + getCostForReservation(r.platform, r.adults), 0);
  const totalTours    = tours.length;

  const platformBreakdown = useMemo(() => {
    const platforms = [...new Set(allConfirmedRes.map((r: BillingReservation) => r.platform))];
    return platforms.map((plat: string) => {
      const res     = allConfirmedRes.filter((r: BillingReservation) => r.platform === plat);
      const adults  = res.reduce((a: number, r: BillingReservation) => a + r.adults, 0);
      const cred    = res.reduce((a: number, r: BillingReservation) => a + getCreditsForReservation(r.platform, r.adults), 0);
      const cost    = res.reduce((a: number, r: BillingReservation) => a + getCostForReservation(r.platform, r.adults), 0);
      return { platform: plat, adults, credits: cred, cost };
    });
  }, [allConfirmedRes]);

  const guruConsumed = allConfirmedRes
    .filter((r: BillingReservation) => r.platform === "guruwalk")
    .reduce((a: number, r: BillingReservation) => a + getCreditsForReservation("guruwalk", r.adults), 0);
  const freeConsumed = allConfirmedRes
    .filter((r: BillingReservation) => r.platform === "freetour")
    .reduce((a: number, r: BillingReservation) => a + getCreditsForReservation("freetour", r.adults), 0);

  if (!activeGuideId) return (
    <div className="flex items-center justify-center h-64 opacity-20">
      <span className="text-sm">Sin guía seleccionada</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 pb-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Facturación</h1>
          {activeGuide && <p className="text-xs opacity-40 mt-0.5">{activeGuide.name}</p>}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Selector de guía — solo admin */}
          {isAdmin && guides.length > 0 && (
            <div className="relative">
              <select
                value={selectedGuideId ?? ""}
                onChange={(e) => setSelectedGuideId(e.target.value)}
                className="select select-sm bg-base-200 border-none pr-8 appearance-none"
              >
                {guides.map((g: GuideProfile) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
            </div>
          )}

          {/* Selector de mes */}
          <div className="relative">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="select select-sm bg-base-200 border-none pr-8 appearance-none capitalize"
            >
              {months.map((m) => (
                <option key={m} value={m}>{formatMonth(m)}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
          </div>

          {/* Exportar */}
          <button
            onClick={() => activeGuide && exportToExcel(activeGuide, month, tours)}
            disabled={tours.length === 0}
            className="btn btn-sm bg-base-content text-base-100 hover:bg-base-content/85 border-none gap-2 disabled:opacity-30"
          >
            <Download size={14} />
            Exportar Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 gap-3 opacity-30">
          <span className="loading loading-spinner loading-sm" />
          <span className="text-sm">Cargando datos...</span>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard label="Total invertido"    value={`€${totalCost.toFixed(2)}`}                    icon={Euro}     />
            <KPICard label="PAX confirmados"    value={totalAdults + totalChildren} sub={`${totalAdults}A / ${totalChildren}N`} icon={Users}    />
            <KPICard label="Tours realizados"   value={totalTours}                                    icon={Calendar} />
          </div>

          {/* Créditos */}
          {activeGuideId && (
            <div className="bg-base-100 border border-base-content/10 rounded-2xl p-5">
              <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-4">
                Seguimiento de créditos
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <CreditsEditor guideId={activeGuideId} platform="guruwalk" initial={credits.guruwalk} consumed={guruConsumed} />
                <CreditsEditor guideId={activeGuideId} platform="freetour" initial={credits.freetour} consumed={freeConsumed} />
              </div>
            </div>
          )}

          {/* Desglose por plataforma */}
          {platformBreakdown.length > 0 && (
            <div className="bg-base-100 border border-base-content/10 rounded-2xl p-5">
              <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-4">
                Desglose por plataforma
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-base-content/5">
                      <th className="text-left py-2 text-xs font-bold opacity-40 uppercase tracking-wider">Plataforma</th>
                      <th className="text-right py-2 text-xs font-bold opacity-40 uppercase tracking-wider">Adultos</th>
                      <th className="text-right py-2 text-xs font-bold opacity-40 uppercase tracking-wider">Créditos</th>
                      <th className="text-right py-2 text-xs font-bold opacity-40 uppercase tracking-wider">Coste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformBreakdown.map((row) => (
                      <tr key={row.platform} className="border-b border-base-content/5 last:border-b-0">
                        <td className="py-3 font-semibold">{PLATFORM_LABELS[row.platform] ?? row.platform}</td>
                        <td className="py-3 text-right opacity-70">{row.adults}</td>
                        <td className="py-3 text-right opacity-70">{row.credits}</td>
                        <td className="py-3 text-right font-bold">€{row.cost.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-base-content/10 font-bold">
                      <td className="py-3">Total</td>
                      <td className="py-3 text-right">{totalAdults}</td>
                      <td className="py-3 text-right">{platformBreakdown.reduce((a, r) => a + r.credits, 0)}</td>
                      <td className="py-3 text-right text-base font-black">€{totalCost.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Desglose detallado */}
          <div className="bg-base-100 border border-base-content/10 rounded-2xl p-5">
            <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-4">
              Desglose detallado por tour y día
            </h2>

            {tours.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2 opacity-20">
                <span className="text-3xl">📋</span>
                <span className="text-sm">Sin tours confirmados este mes</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-base-content/5">
                      <th className="text-left py-2 text-xs font-bold opacity-40 uppercase tracking-wider">Fecha</th>
                      <th className="text-left py-2 text-xs font-bold opacity-40 uppercase tracking-wider">Tour</th>
                      <th className="text-left py-2 text-xs font-bold opacity-40 uppercase tracking-wider">Horario</th>
                      <th className="text-right py-2 text-xs font-bold opacity-40 uppercase tracking-wider">PAX</th>
                      <th className="text-right py-2 text-xs font-bold opacity-40 uppercase tracking-wider">Reservas</th>
                      <th className="text-right py-2 text-xs font-bold opacity-40 uppercase tracking-wider">Plataforma</th>
                      <th className="text-right py-2 text-xs font-bold opacity-40 uppercase tracking-wider">Inversión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tours.map((tour: BillingTour) => {
                      const guideRes     = tour.reservations.filter((r: BillingReservation) => r.attended);
                      const tourAdults   = guideRes.reduce((a: number, r: BillingReservation) => a + r.adults, 0);
                      const tourChildren = guideRes.reduce((a: number, r: BillingReservation) => a + r.children, 0);
                      const tourCost     = guideRes.reduce((a: number, r: BillingReservation) => a + getCostForReservation(r.platform, r.adults), 0);
                      const platforms    = [...new Set(guideRes.map((r: BillingReservation) => PLATFORM_LABELS[r.platform] ?? r.platform))];
                      const fecha = new Date(tour.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });

                      return (
                        <tr key={tour.id} className="border-b border-base-content/5 last:border-b-0 hover:bg-base-content/2">
                          <td className="py-3 font-semibold capitalize">{fecha}</td>
                          <td className="py-3 opacity-70 max-w-45 truncate">{tour.title}</td>
                          <td className="py-3 font-mono opacity-60">{tour.time.slice(0, 5)}</td>
                          <td className="py-3 text-right opacity-70">{tourAdults}A / {tourChildren}N</td>
                          <td className="py-3 text-right opacity-70">{guideRes.length}</td>
                          <td className="py-3 text-right opacity-60 text-xs">{platforms.join(", ")}</td>
                          <td className="py-3 text-right font-bold">€{tourCost.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-base-content/10 font-bold bg-base-200/30">
                      <td colSpan={3} className="py-3 pl-2">Total del mes</td>
                      <td className="py-3 text-right">{totalAdults}A / {totalChildren}N</td>
                      <td className="py-3 text-right">{allConfirmedRes.length}</td>
                      <td />
                      <td className="py-3 text-right text-base font-black">€{totalCost.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
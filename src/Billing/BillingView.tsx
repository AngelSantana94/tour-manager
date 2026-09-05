import { useState, useMemo, useCallback } from "react";
import {
  Download,
  Euro,
  Users,
  Calendar,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "../login/AuthContext";
import AddTourModal from "./AddTourModal";
import EditTourModal from "./EditTourModal";
import DeleteConfirmModal from "./DeleteConfirmModal";
import AddBalanceModal from "./AddBalanceModal";
import {
  useBillingData,
  useBillingSettings,
  useManualBillingEntries,
  useGuideBalance,
  buildBillingEntries,
  getCostForReservation,
  deleteManualBillingEntry,
  deleteGuideBalanceEntry,
  BALANCE_PLATFORMS,
  type BillingEntry,
  type BillingMode,
  type GuideProfile,
  type ManualBillingEntry,
  type GuideBalanceEntry,
  type BalancePlatform,
} from "./UseBillingData";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const PLATFORM_LABELS: Record<string, string> = {
  guruwalk: "GuruWalk",
  freetour: "FreeTour",
  turixe: "Turixe",
  tripadvisor: "TripAdvisor",
  plaza: "Plaza",
  viator: "Viator",
  taro: "Taro",
};

const MODE_LABELS: Record<BillingMode, string> = {
  auto: "Automático (calendario)",
  manual: "Manual",
  both: "Automático + Manual",
};

function formatMonth(m: string): string {
  const [y, mon] = m.split("-");
  return new Date(parseInt(y), parseInt(mon) - 1, 1).toLocaleDateString(
    "es-ES",
    { month: "long", year: "numeric" },
  );
}

function generateMonths(): string[] {
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
function formatEntryDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date
    .toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    .replace(/\.$/, "")
    .replace(/\. /, " ");
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
function KPICard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
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

// ─── TARJETA DE SALDO POR PLATAFORMA ───────────────────────────────────────────
function BalanceCard({
  platform,
  balance,
  onAddBalance,
}: {
  platform: BalancePlatform;
  balance: number;
  onAddBalance: () => void;
}) {
  const positive = balance > 0;
  return (
    <div className="bg-base-100 border border-base-content/10 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest opacity-40">
          Saldo {PLATFORM_LABELS[platform]}
        </span>
        <button
          onClick={onAddBalance}
          className="btn btn-xs gap-1 bg-base-content text-base-100 hover:bg-base-content/85 border-none"
        >
          <Plus size={12} /> Añadir saldo
        </button>
      </div>
      <span
        className={[
          "text-3xl font-black leading-none",
          positive ? "text-emerald-600" : "text-red-500",
        ].join(" ")}
      >
        {positive ? "+" : ""}€{balance.toFixed(2)}
      </span>
    </div>
  );
}

// ─── CONFIRMACIÓN DE BORRADO DE SALDO ──────────────────────────────────────────
// Minimalista y responsive: mismo patrón visual que el resto de modales de
// esta vista (overlay + tarjeta centrada, botón de acción en negro), pero
// dedicado a mostrar el importe exacto que se va a borrar para que el guía
// confirme sabiendo qué está quitando.
function DeleteBalanceConfirmModal({
  entry,
  saving,
  onCancel,
  onConfirm,
}: {
  entry: GuideBalanceEntry;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div className="bg-base-100 rounded-2xl shadow-xl w-full max-w-sm p-5 flex flex-col gap-4">
        <h3 className="text-base font-bold">¿Eliminar este saldo?</h3>
        <p className="text-sm opacity-70 leading-relaxed">
          Vas a borrar{" "}
          <span className="font-bold text-base-content">
            +€{Number(entry.amount).toFixed(2)}
          </span>{" "}
          añadidos a{" "}
          <span className="font-semibold">
            {PLATFORM_LABELS[entry.platform] ?? entry.platform}
          </span>{" "}
          el {formatEntryDate(entry.entry_date)}. Esta acción no se puede
          deshacer.
        </p>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={onCancel}
            disabled={saving}
            className="btn btn-outline border-base-content/20 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="btn bg-base-content text-base-100 hover:bg-base-content/85 border-none disabled:opacity-40"
          >
            {saving ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "Aceptar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EXPORTAR A .XLSX (plantilla inspirada en el Excel de comisiones) ─────────
function exportToExcel(
  guide: GuideProfile,
  month: string,
  entries: BillingEntry[],
  withIva: boolean,
) {
  const rows: (string | number)[][] = [];

  rows.push([`Informe de Facturación — ${guide.name}`]);
  rows.push([`Período: ${formatMonth(month)}`]);
  rows.push([`Comisiones mostradas: ${withIva ? "con IVA" : "sin IVA"}`]);
  rows.push([`Generado: ${new Date().toLocaleDateString("es-ES")}`]);
  rows.push([]);
  rows.push([
    "Fecha",
    "Hora",
    "Adultos",
    "Niños",
    "Plataforma",
    "Origen",
    "Comisión (€)",
  ]);

  for (const e of entries) {
    const cost = getCostForReservation(e.platform, e.adults, withIva);
    rows.push([
      formatEntryDate(e.date),
      e.time,
      e.adults,
      e.children,
      PLATFORM_LABELS[e.platform] ?? e.platform,
      e.source === "auto" ? "Calendario" : "Manual",
      Number(cost.toFixed(2)),
    ]);
  }

  const totalAdults = entries.reduce((a, e) => a + e.adults, 0);
  const totalChildren = entries.reduce((a, e) => a + e.children, 0);
  const totalCost = entries.reduce(
    (a, e) => a + getCostForReservation(e.platform, e.adults, withIva),
    0,
  );

  rows.push([]);
  rows.push(["TOTALES"]);
  rows.push(["Total adultos", totalAdults]);
  rows.push(["Total niños", totalChildren]);
  rows.push(["Total comisión", Number(totalCost.toFixed(2))]);

  rows.push([]);
  rows.push(["Desglose por plataforma"]);
  rows.push(["Plataforma", "Adultos", "Comisión (€)"]);

  const platforms = [...new Set(entries.map((e) => e.platform))];
  for (const plat of platforms) {
    const platEntries = entries.filter((e) => e.platform === plat);
    const adults = platEntries.reduce((a, e) => a + e.adults, 0);
    const cost = platEntries.reduce(
      (a, e) => a + getCostForReservation(e.platform, e.adults, withIva),
      0,
    );
    rows.push([PLATFORM_LABELS[plat] ?? plat, adults, Number(cost.toFixed(2))]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 16 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, formatMonth(month).slice(0, 31));

  XLSX.writeFile(
    wb,
    `facturacion_${guide.name.replace(/\s+/g, "_")}_${month}.xlsx`,
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function BillingView() {
  const { profile } = useAuth();

  const months = generateMonths();
  const [month, setMonth] = useState(months[0]);
  const [withIva, setWithIva] = useState(false); // por defecto SIN IVA
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ManualBillingEntry | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [balancePlatform, setBalancePlatform] =
    useState<BalancePlatform | null>(null);
  // Confirmación de borrado de una entrada de saldo (independiente de
  // `deletingId`, que es para entradas manuales de tour).
  const [deletingBalance, setDeletingBalance] =
    useState<GuideBalanceEntry | null>(null);
  const [deletingBalanceSaving, setDeletingBalanceSaving] = useState(false);

  // Solo se ve la facturación del guía que ha iniciado sesión — nada de
  // selector para mirar la de otros guías.
  const guideId = profile?.id ?? null;
  const activeGuide: GuideProfile | undefined = profile
    ? {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        avatar_url: profile.avatar_url ?? null,
      }
    : undefined;

  const {
    tours,
    loading: loadingTours,
    refetch: refetchTours,
  } = useBillingData(guideId, month);
  const { mode, setMode } = useBillingSettings(guideId);
  const {
    entries: manualEntries,
    loading: loadingManual,
    refetch: refetchManual,
  } = useManualBillingEntries(guideId, month);
  const {
    monthEntries: balanceEntries,
    balances,
    loading: loadingBalance,
    refetch: refetchBalance,
  } = useGuideBalance(guideId, month, mode, withIva);

  const loading = loadingTours || loadingManual || loadingBalance;

  const billingEntries = useMemo(
    () =>
      guideId ? buildBillingEntries(tours, manualEntries, guideId, mode) : [],
    [tours, manualEntries, guideId, mode],
  );

  const totalAdults = billingEntries.reduce((a, e) => a + e.adults, 0);
  const totalChildren = billingEntries.reduce((a, e) => a + e.children, 0);

  const guruCost = billingEntries
    .filter((e) => e.platform === "guruwalk")
    .reduce(
      (a, e) => a + getCostForReservation(e.platform, e.adults, withIva),
      0,
    );
  const freeCost = billingEntries
    .filter((e) => e.platform === "freetour")
    .reduce(
      (a, e) => a + getCostForReservation(e.platform, e.adults, withIva),
      0,
    );

  const platformBreakdown = useMemo(() => {
    const platforms = [...new Set(billingEntries.map((e) => e.platform))];
    return platforms.map((plat) => {
      const res = billingEntries.filter((e) => e.platform === plat);
      const adults = res.reduce((a, e) => a + e.adults, 0);
      const cost = res.reduce(
        (a, e) => a + getCostForReservation(e.platform, e.adults, withIva),
        0,
      );
      return { platform: plat, adults, cost };
    });
  }, [billingEntries, withIva]);

  // Filas combinadas del desglose: tours (negro) + saldo añadido (verde),
  // ordenadas cronológicamente.
  type DisplayRow =
    | { kind: "tour"; date: string; entry: BillingEntry }
    | { kind: "balance"; date: string; entry: GuideBalanceEntry };

  const displayRows: DisplayRow[] = useMemo(() => {
    const rows: DisplayRow[] = [
      ...billingEntries.map((e) => ({
        kind: "tour" as const,
        date: e.date,
        entry: e,
      })),
      ...balanceEntries.map((b) => ({
        kind: "balance" as const,
        date: b.entry_date,
        entry: b,
      })),
    ];
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [billingEntries, balanceEntries]);

  const handleTourSaved = useCallback(() => {
    refetchManual();
    refetchBalance();
  }, [refetchManual, refetchBalance]);

  const handleBalanceSaved = useCallback(() => {
    refetchBalance();
  }, [refetchBalance]);

  // Las filas del desglose usan el id combinado "manual:<uuid>" — esto
  // recupera la entrada manual cruda (la que espera el modal de edición).
  function findManualEntry(billingEntryId: string): ManualBillingEntry | null {
    const rawId = billingEntryId.replace(/^manual:/, "");
    return manualEntries.find((m) => m.id === rawId) ?? null;
  }

  async function handleConfirmDelete() {
    if (!deletingId) return;
    setDeleting(true);
    try {
      await deleteManualBillingEntry(deletingId);
      refetchManual();
      refetchBalance();
    } finally {
      setDeleting(false);
      setDeletingId(null);
    }
  }

  async function handleConfirmDeleteBalance() {
    if (!deletingBalance) return;
    setDeletingBalanceSaving(true);
    try {
      await deleteGuideBalanceEntry(deletingBalance.id);
      refetchBalance();
    } finally {
      setDeletingBalanceSaving(false);
      setDeletingBalance(null);
    }
  }

  if (!guideId) {
    return (
      <div className="flex items-center justify-center h-64 opacity-20">
        <span className="text-sm">Sin guía identificado</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Facturación</h1>
          {activeGuide && (
            <p className="text-xs opacity-40 mt-0.5">{activeGuide.name}</p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Selector de mes */}
          <div className="relative">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="select select-sm bg-base-200 border-none pr-8 appearance-none capitalize"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"
            />
          </div>

          {/* Modo de cálculo: auto / manual / both */}
          <div className="relative">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as BillingMode)}
              className="select select-sm bg-base-200 border-none pr-8 appearance-none"
            >
              {(Object.keys(MODE_LABELS) as BillingMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"
            />
          </div>

          {/* Toggle IVA */}
          <label className="flex items-center gap-2 px-3 py-1.5 border border-base-content/20 rounded-lg bg-base-100 hover:bg-base-200 transition-colors cursor-pointer select-none">
            <input
              type="checkbox"
              checked={withIva}
              onChange={(e) => setWithIva(e.target.checked)}
              className="toggle toggle-sm"
            />
            <span className="text-sm font-semibold">
              {withIva ? "Con IVA" : "Sin IVA"}
            </span>
          </label>

          {/* + Añadir Tour */}
          <button
            onClick={() => setModalOpen(true)}
            className="btn btn-sm gap-2 bg-base-content text-base-100 hover:bg-base-content/85 border-none font-semibold"
          >
            <Plus size={14} />
            Añadir Tour
          </button>

          {/* Exportar */}
          <button
            onClick={() =>
              activeGuide &&
              exportToExcel(activeGuide, month, billingEntries, withIva)
            }
            disabled={billingEntries.length === 0}
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
          {/* KPIs: comisión dividida por plataforma + pax/tours del mes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label={`Comisión GuruWalk (${withIva ? "con" : "sin"} IVA)`}
              value={`€${guruCost.toFixed(2)}`}
              icon={Euro}
            />
            <KPICard
              label="Comisión FreeTour"
              value={`€${freeCost.toFixed(2)}`}
              icon={Euro}
            />
            <KPICard
              label="PAX registrados"
              value={totalAdults + totalChildren}
              sub={`${totalAdults}A / ${totalChildren}N`}
              icon={Users}
            />
            <KPICard
              label="Tours registrados"
              value={billingEntries.length}
              icon={Calendar}
            />
          </div>

          {/* Saldo por plataforma */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {BALANCE_PLATFORMS.map((p) => (
              <BalanceCard
                key={p}
                platform={p}
                balance={balances[p] ?? 0}
                onAddBalance={() => setBalancePlatform(p)}
              />
            ))}
          </div>

          {/* Desglose por plataforma */}
          {platformBreakdown.length > 0 && (
            <div className="bg-base-100 border border-base-content/10 rounded-2xl p-5">
              <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-4">
                Desglose por plataforma
              </h2>
              <div className="overflow-x-auto">
                {/* min-w fuerza el scroll lateral en móvil en vez de apretar
                    las columnas — con px-4 en cada celda queda espacio real
                    entre ellas y cada columna cae recta hacia abajo. */}
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-base-content/5">
                      <th className="text-left py-2 px-4 text-xs font-bold opacity-40 uppercase tracking-wider">
                        Plataforma
                      </th>
                      <th className="text-right py-2 px-4 text-xs font-bold opacity-40 uppercase tracking-wider">
                        Adultos
                      </th>
                      <th className="text-right py-2 px-4 text-xs font-bold opacity-40 uppercase tracking-wider">
                        Comisión
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformBreakdown.map((row) => (
                      <tr
                        key={row.platform}
                        className="border-b border-base-content/5 last:border-b-0"
                      >
                        <td className="py-3 px-4 font-semibold">
                          {PLATFORM_LABELS[row.platform] ?? row.platform}
                        </td>
                        <td className="py-3 px-4 text-right opacity-70">
                          {row.adults}
                        </td>
                        <td className="py-3 px-4 text-right font-bold">
                          €{row.cost.toFixed(2)}
                        </td>
                      </tr>
                    ))}
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

            {displayRows.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2 opacity-20">
                <span className="text-3xl">📋</span>
                <span className="text-sm">Sin movimientos este mes</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* min-w fuerza el scroll lateral en móvil en vez de apretar
                    las 7 columnas — con px-4 en cada celda queda espacio
                    real entre ellas y cada columna cae recta hacia abajo. */}
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-base-content/5">
                      <th className="text-left py-2 px-4 text-xs font-bold opacity-40 uppercase tracking-wider">
                        Fecha
                      </th>
                      <th className="text-left py-2 px-4 text-xs font-bold opacity-40 uppercase tracking-wider">
                        Hora
                      </th>
                      <th className="text-right py-2 px-4 text-xs font-bold opacity-40 uppercase tracking-wider">
                        Adultos
                      </th>
                      <th className="text-right py-2 px-4 text-xs font-bold opacity-40 uppercase tracking-wider">
                        Niños
                      </th>
                      <th className="text-left py-2 px-4 text-xs font-bold opacity-40 uppercase tracking-wider">
                        Plataforma
                      </th>
                      <th className="text-right py-2 px-4 text-xs font-bold opacity-40 uppercase tracking-wider">
                        Comisión
                      </th>
                      <th className="text-right py-2 px-4 text-xs font-bold opacity-40 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row) => {
                      if (row.kind === "balance") {
                        const b = row.entry;
                        return (
                          <tr
                            key={`balance:${b.id}`}
                            className="border-b border-base-content/5 last:border-b-0 bg-emerald-50"
                          >
                            <td className="py-3 px-4 font-semibold capitalize text-emerald-700">
                              {formatEntryDate(b.entry_date)}
                            </td>
                            <td
                              colSpan={4}
                              className="py-3 px-4 font-semibold text-emerald-700"
                            >
                              Saldo añadido por el guía ·{" "}
                              {PLATFORM_LABELS[b.platform] ?? b.platform}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-700">
                              +€{Number(b.amount).toFixed(2)}
                            </td>
                            {/* Botón de borrar separado en su propia columna
                                (Acciones), a distancia del importe, pero con
                                el mismo estilo discreto que las acciones de
                                las filas manuales de abajo. */}
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => setDeletingBalance(b)}
                                className="btn btn-ghost btn-xs btn-circle opacity-40 hover:opacity-80"
                                aria-label="Eliminar saldo"
                                title="Eliminar saldo"
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      const e = row.entry;
                      const cost = getCostForReservation(
                        e.platform,
                        e.adults,
                        withIva,
                      );
                      return (
                        <tr
                          key={e.id}
                          className="border-b border-base-content/5 last:border-b-0 hover:bg-base-content/[0.02]"
                        >
                          <td className="py-3 px-4 font-semibold capitalize">
                            {formatEntryDate(e.date)}
                          </td>
                          <td className="py-3 px-4 font-mono opacity-60">
                            {e.time}
                          </td>
                          <td className="py-3 px-4 text-right opacity-70">
                            {e.adults}
                          </td>
                          <td className="py-3 px-4 text-right opacity-70">
                            {e.children}
                          </td>
                          <td className="py-3 px-4 opacity-70 text-xs">
                            <div className="flex items-center gap-1.5">
                              {PLATFORM_LABELS[e.platform] ?? e.platform}
                              {e.source === "manual" && (
                                <span className="text-[9px] font-bold uppercase bg-base-200 text-base-content/40 px-1.5 py-0.5 rounded">
                                  manual
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-bold">
                            €{cost.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {e.source === "manual" && (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    const raw = findManualEntry(e.id);
                                    if (raw) setEditingEntry(raw);
                                  }}
                                  className="btn btn-ghost btn-xs btn-circle opacity-40 hover:opacity-80"
                                  aria-label="Editar"
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  onClick={() =>
                                    setDeletingId(e.id.replace(/^manual:/, ""))
                                  }
                                  className="btn btn-ghost btn-xs btn-circle opacity-40 hover:opacity-80"
                                  aria-label="Eliminar"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-base-content/10 font-bold bg-base-200/30">
                      <td colSpan={2} className="py-3 px-4">
                        Total del mes
                      </td>
                      <td className="py-3 px-4 text-right">{totalAdults}</td>
                      <td className="py-3 px-4 text-right">{totalChildren}</td>
                      <td />
                      <td className="py-3 px-4 text-right text-base font-black">
                        €{(guruCost + freeCost).toFixed(2)}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {modalOpen && (
        <AddTourModal
          guideId={guideId}
          onClose={() => setModalOpen(false)}
          onSaved={handleTourSaved}
        />
      )}

      {editingEntry && (
        <EditTourModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={handleTourSaved}
        />
      )}

      {deletingId && (
        <DeleteConfirmModal
          loading={deleting}
          onCancel={() => setDeletingId(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {deletingBalance && (
        <DeleteBalanceConfirmModal
          entry={deletingBalance}
          saving={deletingBalanceSaving}
          onCancel={() => setDeletingBalance(null)}
          onConfirm={handleConfirmDeleteBalance}
        />
      )}

      {balancePlatform && (
        <AddBalanceModal
          guideId={guideId}
          platform={balancePlatform}
          platformLabel={PLATFORM_LABELS[balancePlatform]}
          onClose={() => setBalancePlatform(null)}
          onSaved={handleBalanceSaved}
        />
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Building2, Calendar, Euro, Plus, Users, Wallet } from "lucide-react";
import { fetchMonthTours, type BillingTour } from "./Services/Billing.adapter";
import { getTourFinance } from "./BillingRules";
import {
  KPICard,
  TH_LEFT,
  TH_RIGHT,
  formatEntryDate,
  formatEuro,
} from "./BillingBlocks";

interface ProviderRow {
  key: string;
  name: string;
  tours: number;
  revenue: number;
  providerShare: number;
}

export default function AdminBilling({ month }: { month: string }) {
  const [tours, setTours] = useState<BillingTour[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTours(null);
    setError(null);

    fetchMonthTours(month)
      .then((result) => {
        if (!cancelled) setTours(result);
      })
      .catch((err) => {
        console.error("Error cargando facturación:", err);
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "No se pudo cargar la facturación.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [month]);

  const { rows, totals, byProvider } = useMemo(() => {
    const list = (tours ?? []).map((tour) => ({
      tour,
      fin: getTourFinance(tour),
    }));

    const sums = list.reduce(
      (acc, { fin }) => ({
        tours: acc.tours + 1,
        total: acc.total + fin.total,
        guide: acc.guide + fin.guide,
        provider: acc.provider + fin.provider,
        coordination: acc.coordination + fin.coordination,
      }),
      { tours: 0, total: 0, guide: 0, provider: 0, coordination: 0 },
    );

    const providers = new Map<string, ProviderRow>();
    for (const { tour, fin } of list) {
      const key = tour.providerId ?? "none";
      const entry = providers.get(key) ?? {
        key,
        name: tour.providerName ?? "Sin proveedor",
        tours: 0,
        revenue: 0,
        providerShare: 0,
      };
      entry.tours += 1;
      entry.revenue += fin.total;
      entry.providerShare += fin.provider;
      providers.set(key, entry);
    }

    return {
      rows: list,
      totals: sums,
      byProvider: [...providers.values()].sort(
        (a, b) => b.tours - a.tours || a.name.localeCompare(b.name, "es"),
      ),
    };
  }, [tours]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-40 px-4">
        <span className="text-sm text-error text-center">{error}</span>
      </div>
    );
  }

  if (!tours) {
    return (
      <div className="flex items-center justify-center h-40 gap-3 opacity-30">
        <span className="loading loading-spinner loading-sm" />
        <span className="text-sm">Cargando datos...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          label="Tours realizados"
          value={totals.tours}
          icon={Calendar}
        />
        <KPICard
          label="Facturado"
          value={formatEuro(totals.total)}
          icon={Euro}
        />
        <KPICard
          label="Pago a guías"
          value={formatEuro(totals.guide)}
          icon={Users}
        />
        <KPICard
          label="Parte proveedores"
          value={formatEuro(totals.provider)}
          icon={Building2}
        />
        <KPICard
          label="Coordinación"
          value={formatEuro(totals.coordination)}
          icon={Wallet}
        />
      </div>

      {/* Por proveedor */}
      {byProvider.length > 0 && (
        <div className="bg-base-100 border border-base-content/10 rounded-2xl p-5">
          <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-4">
            Por proveedor
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-base-content/5">
                  <th className={TH_LEFT}>Proveedor</th>
                  <th className={TH_RIGHT}>Tours</th>
                  <th className={TH_RIGHT}>Facturado</th>
                  <th className={TH_RIGHT}>Su parte</th>
                </tr>
              </thead>
              <tbody>
                {byProvider.map((p) => (
                  <tr
                    key={p.key}
                    className="border-b border-base-content/5 last:border-b-0"
                  >
                    <td className="py-3 px-4 font-semibold">{p.name}</td>
                    <td className="py-3 px-4 text-right opacity-70">
                      {p.tours}
                    </td>
                    <td className="py-3 px-4 text-right opacity-70">
                      {formatEuro(p.revenue)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold">
                      {formatEuro(p.providerShare)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detalle por tour */}
      <div className="bg-base-100 border border-base-content/10 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest">
            Detalle por tour
          </h2>

          {/* Alta manual de un tour (solo coordinadora). Se conectará con el
              módulo de vouchers cuando esté movido a esta carpeta. */}
          <button
            type="button"
            disabled
            title="Se conectará con el módulo de vouchers"
            className="btn btn-sm gap-2 bg-base-content text-base-100 border-none font-semibold disabled:opacity-30"
          >
            <Plus size={14} />
            Añadir tour a mano
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2 opacity-20">
            <span className="text-3xl">📋</span>
            <span className="text-sm">Sin tours realizados este mes</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-base-content/5">
                  <th className={TH_LEFT}>Fecha</th>
                  <th className={TH_LEFT}>ID servicio</th>
                  <th className={TH_LEFT}>Tour</th>
                  <th className={TH_LEFT}>Proveedor</th>
                  <th className={TH_LEFT}>Operador</th>
                  <th className={TH_LEFT}>Guía lead</th>
                  <th className={TH_RIGHT}>Total tour</th>
                  <th className={TH_RIGHT}>Pago guía</th>
                  <th className={TH_RIGHT}>Parte proveedor</th>
                  <th className={TH_RIGHT}>Coordinación</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ tour, fin }) => (
                  <tr
                    key={tour.id}
                    className="border-b border-base-content/5 last:border-b-0 hover:bg-base-content/[0.02]"
                  >
                    <td className="py-3 px-4 font-semibold capitalize">
                      {formatEntryDate(tour.date)}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs opacity-60">
                      {tour.serviceId ?? "—"}
                    </td>
                    <td className="py-3 px-4 opacity-70">
                      {tour.tourType ?? "—"}
                    </td>
                    <td className="py-3 px-4 opacity-70">
                      {tour.providerName ?? "—"}
                    </td>
                    <td className="py-3 px-4 opacity-70">
                      {tour.operatorName ?? "—"}
                    </td>
                    <td className="py-3 px-4 opacity-70">
                      {tour.leadName ?? "Sin guía"}
                    </td>
                    <td className="py-3 px-4 text-right font-bold">
                      {formatEuro(fin.total)}
                    </td>
                    <td className="py-3 px-4 text-right opacity-70">
                      {formatEuro(fin.guide)}
                    </td>
                    <td className="py-3 px-4 text-right opacity-70">
                      {formatEuro(fin.provider)}
                    </td>
                    <td className="py-3 px-4 text-right opacity-70">
                      {formatEuro(fin.coordination)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-base-content/10 font-bold bg-base-200/30">
                  <td colSpan={6} className="py-3 px-4">
                    Total del mes
                  </td>
                  <td className="py-3 px-4 text-right">
                    {formatEuro(totals.total)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {formatEuro(totals.guide)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {formatEuro(totals.provider)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {formatEuro(totals.coordination)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
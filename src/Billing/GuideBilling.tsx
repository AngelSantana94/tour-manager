import { useEffect, useMemo, useState } from "react";
import { Calendar, Euro } from "lucide-react";
import { fetchMonthTours, type BillingTour } from "./Services/Billing.adapter";
import { getTourFinance } from "./BillingRules";
import {
  KPICard,
  TH_LEFT,
  TH_RIGHT,
  formatEntryDate,
  formatEuro,
} from "./BillingBlocks";

export default function GuideBilling({
  month,
  guideId,
}: {
  month: string;
  guideId: string;
}) {
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
        console.error("Error cargando tu facturación:", err);
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "No se pudo cargar tu facturación.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [month]);

  // Solo se paga al guía lead: los tours donde eres back-up no cuentan aquí.
  const { rows, totalPay } = useMemo(() => {
    const mine = (tours ?? [])
      .filter((t) => t.leadId === guideId)
      .map((tour) => ({ tour, fin: getTourFinance(tour) }));

    return {
      rows: mine,
      totalPay: mine.reduce((sum, { fin }) => sum + fin.guide, 0),
    };
  }, [tours, guideId]);

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard
          label="Tours realizados"
          value={rows.length}
          sub="como guía lead"
          icon={Calendar}
        />
        <KPICard
          label="Tu pago del mes"
          value={formatEuro(totalPay)}
          icon={Euro}
        />
      </div>

      <div className="bg-base-100 border border-base-content/10 rounded-2xl p-5">
        <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-4">
          Detalle por tour
        </h2>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2 opacity-20">
            <span className="text-3xl">📋</span>
            <span className="text-sm">Sin tours realizados este mes</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-base-content/5">
                  <th className={TH_LEFT}>Fecha</th>
                  <th className={TH_LEFT}>ID servicio</th>
                  <th className={TH_LEFT}>Tour</th>
                  <th className={TH_LEFT}>Proveedor</th>
                  <th className={TH_LEFT}>Operador</th>
                  <th className={TH_RIGHT}>Tu pago</th>
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
                    <td className="py-3 px-4 text-right font-bold">
                      {formatEuro(fin.guide)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-base-content/10 font-bold bg-base-200/30">
                  <td colSpan={5} className="py-3 px-4">
                    Total del mes
                  </td>
                  <td className="py-3 px-4 text-right text-base font-black">
                    {formatEuro(totalPay)}
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
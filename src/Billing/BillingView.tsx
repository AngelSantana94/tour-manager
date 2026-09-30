import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  fetchBillingViewer,
  type BillingViewer,
} from "./Services/Billing.adapter";
import { formatMonth, generateMonths } from "./BillingBlocks";
import AdminBilling from "./AdminBilling";
import GuideBilling from "./GuideBilling";

// BillingView es solo vista: elige el mes y decide qué ve cada rol. Los
// números salen de billingRules.ts y cada rol tiene su propio archivo
// (AdminBilling, GuideBilling).
export default function BillingView() {
  const months = useMemo(() => generateMonths(), []);
  const [month, setMonth] = useState(months[0]);

  const [viewer, setViewer] = useState<BillingViewer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchBillingViewer()
      .then((result) => {
        if (!cancelled) setViewer(result);
      })
      .catch((err) => {
        console.error("Error identificando al usuario:", err);
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "No se pudo cargar tu perfil.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 px-4">
        <span className="text-sm text-error text-center">{error}</span>
      </div>
    );
  }

  if (!viewer) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 opacity-30">
        <span className="loading loading-spinner loading-sm" />
        <span className="text-sm">Cargando...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Facturación</h1>
          <p className="text-xs opacity-40 mt-0.5">
            {viewer.isAdmin ? "Visión general" : "Tu facturación"}
          </p>
        </div>

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
      </div>

      {viewer.isAdmin ? (
        <AdminBilling month={month} />
      ) : viewer.guideId ? (
        <GuideBilling month={month} guideId={viewer.guideId} />
      ) : (
        <div className="flex items-center justify-center h-40 px-4">
          <span className="text-sm text-error text-center">
            No se encontró tu perfil de guía.
          </span>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Building2, Calendar, Truck } from "lucide-react";
import { fetchAdminMetrics, type AdminMetrics } from "./Services/Metrics.adapter";
import { CountList, KPICard } from "./MetricsBlocks";

export default function AdminOverview() {
  const [data, setData] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchAdminMetrics()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        console.error("Error cargando métricas:", err);
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "No se pudieron cargar las métricas.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-40">
        <span className="text-sm text-error">{error}</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 gap-3 opacity-30">
        <span className="loading loading-spinner loading-sm" />
        <span className="text-sm">Cargando métricas...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Tours hechos"
          value={data.totalTours}
          sub="en total"
          icon={Calendar}
          accent="#ff6b35"
        />
        <KPICard
          label="Proveedores"
          value={data.byProvider.length}
          sub="con tours"
          icon={Truck}
          accent="#3b82f6"
        />
        <KPICard
          label="Operadores"
          value={data.byOperator.length}
          sub="con tours"
          icon={Building2}
          accent="#10b981"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CountList
          title="Tours por proveedor"
          rows={data.byProvider}
          accent="#3b82f6"
        />
        <CountList
          title="Tours por operador"
          rows={data.byOperator}
          accent="#10b981"
        />
      </div>
    </div>
  );
}
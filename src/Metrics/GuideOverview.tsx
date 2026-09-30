import { useEffect, useState } from "react";
import { Award, Calendar, Users } from "lucide-react";
import { fetchGuideMetrics, type GuideMetrics } from "./Services/Metrics.adapter";
import { CountList, KPICard } from "./MetricsBlocks";

export default function GuideOverview({ guideId }: { guideId: string }) {
  const [data, setData] = useState<GuideMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    fetchGuideMetrics(guideId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        console.error("Error cargando tus métricas:", err);
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "No se pudieron cargar tus métricas.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [guideId]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-40 px-4">
        <span className="text-sm text-error text-center">{error}</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 gap-3 opacity-30">
        <span className="loading loading-spinner loading-sm" />
        <span className="text-sm">Cargando tus métricas...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard
          label="Tours hechos"
          value={data.totalTours}
          sub="en total"
          icon={Calendar}
          accent="#ff6b35"
        />
        <KPICard
          label="Como guía lead"
          value={data.asLead}
          sub="tours"
          icon={Award}
          accent="#8b5cf6"
        />
        <KPICard
          label="Como back-up"
          value={data.asBackup}
          sub="tours"
          icon={Users}
          accent="#3b82f6"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CountList
          title="Tus tours por proveedor"
          rows={data.byProvider}
          accent="#3b82f6"
        />
        <CountList
          title="Tus tours por operador"
          rows={data.byOperator}
          accent="#10b981"
        />
      </div>
    </div>
  );
}
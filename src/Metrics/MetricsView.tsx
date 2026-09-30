import { useEffect, useState } from "react";
import {
  fetchMetricsViewer,
  type MetricsViewer,
} from "./Services/Metrics.adapter";
import AdminOverview from "./AdminOverview ";
import GuideOverview from "./GuideOverview";

// MetricsView solo decide qué ve cada rol. Las métricas viven en sus propios
// archivos (AdminOverview, GuideOverview); los filtros y gráficos nuevos se
// añaden allí, no aquí.
export default function MetricsView() {
  const [viewer, setViewer] = useState<MetricsViewer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchMetricsViewer()
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
      <div>
        <h1 className="text-2xl font-black text-base-content tracking-tight">
          Métricas
        </h1>
        <p className="text-xs opacity-40 mt-0.5">
          {viewer.isAdmin ? "Visión general" : "Tu actividad como guía"}
        </p>
      </div>

      {viewer.isAdmin ? (
        <AdminOverview />
      ) : viewer.guideId ? (
        <GuideOverview guideId={viewer.guideId} />
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

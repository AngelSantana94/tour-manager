import { useEffect, useState } from "react";
import {
  fetchManageableTours,
  type TgbTour,
} from "../Calendars/Services/SupabaseTGB.adapter";
import TourAvailabilityCard from "./TourAvailabilityCard";

export default function GuideAvailabilityBase() {
  const [tours, setTours] = useState<TgbTour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchManageableTours()
      .then(setTours)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error desconocido"),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 max-w-5xl mx-auto pb-24">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-base-content">
          ¿Qué tour deseas administrar?
        </h1>
        <p className="text-xs opacity-50 mt-1">
          Gestiona la disponibilidad planificada de tus tours
        </p>
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <span className="loading loading-spinner text-primary" />
        </div>
      )}

      {error && <p className="text-sm text-error text-center py-6">{error}</p>}

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {tours.map((tour) => (
            <TourAvailabilityCard key={tour.id} tour={tour} />
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";

// Definimos la estructura según tu captura de Google Sheets
export interface TourEvent {
  id: number;
  title: string;
  date: string;
  time: string;
  guide: string;
  language: string;
  pax: number;
}

function CalendarEvent() {
  const [events, setEvents] = useState<TourEvent[]>([]);

  useEffect(() => {
    // Reemplaza con la URL que te dio Google al implementar
    const SHEET_URL = "https://script.google.com/macros/s/AKfycbxdOMFpq5s-UEuyl080pWesjrLrdSbX0WuKJa9wrRYf5wK1OewPCyjRM0FDSNORDmKxCQ/exec";

    console.log("Iniciando petición a Google Sheets...");

    fetch(SHEET_URL)
      .then((res) => res.json())
      .then((data) => {
        console.log("✅ Datos recibidos con éxito:");
        console.table(data); // Esto te lo muestra como una tablita en la consola
        setEvents(data);
      })
      .catch((err) => {
        console.error("❌ Error al jalar los eventos:", err);
      });
  }, []);

  return (
    <div className="hidden">
      {/* Este componente de momento solo gestiona datos */}
    </div>
  );
}

export default CalendarEvent;

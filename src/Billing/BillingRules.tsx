import type { BillingTour } from "./Services/Billing.adapter";

// ─── REGLA DE REPARTO POR TOUR REALIZADO ──────────────────────────────────────
// PROVISIONAL: importes fijos. Es el ÚNICO sitio donde viven estos números:
// cuando el importe generado llegue automáticamente al acabar cada tour, se
// cambia solo getTourFinance() y toda la vista se actualiza sin tocar más.
//
//   El tour se cobra a 185 €:
//     · 140 € → guía (lead)
//     ·  30 € → proveedor
//     ·  15 € → coordinación (admin)
//   guía + proveedor + coordinación tiene que sumar TOUR_PRICE.
export const TOUR_PRICE = 185;
export const TOUR_SPLIT = {
  guide: 140,
  provider: 30,
  coordination: 15,
} as const;

export interface TourFinance {
  total: number;
  guide: number;
  provider: number;
  coordination: number;
}

// Recibe el tour para que, al conectar los importes reales, la firma no cambie.
export function getTourFinance(_tour: BillingTour): TourFinance {
  return {
    total: TOUR_PRICE,
    guide: TOUR_SPLIT.guide,
    provider: TOUR_SPLIT.provider,
    coordination: TOUR_SPLIT.coordination,
  };
}

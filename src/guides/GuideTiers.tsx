import {
  Crown,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react";

export type GuideTier =
  | "top"
  | "standard"
  | "last";

export interface TierConfig {
  id: GuideTier;
  title: string;
  subtitle: string;
  Icon: typeof Crown;

  /**
   * Color de la línea superior.
   * Se adapta al tema porque utiliza variables
   * de DaisyUI/Tailwind.
   */
  accent: string;

  /**
   * Estilo del icono.
   */
  iconStyle: string;

  /**
   * Se mantiene por compatibilidad con
   * cualquier componente que todavía
   * utilice tier.column / tier.over.
   */
  column: string;
  over: string;
}

export const TIERS: TierConfig[] = [
  {
    id: "top",

    title: "Guías Vivalux",

    subtitle:
      "Guías con experiencia y máxima prioridad",

    Icon: Crown,

    accent:
      "bg-amber-400 dark:bg-amber-300",

    iconStyle:
      "bg-amber-500/10 text-amber-600 dark:text-amber-300",

    column:
      "border-amber-500/10",

    over:
      "ring-2 ring-amber-500/10",
  },

  {
    id: "standard",

    title: "Guías Estándar",

    subtitle:
      "Guías activas disponibles para tours",

    Icon: ShieldCheck,

    accent:
      "bg-primary",

    iconStyle:
      "bg-primary/10 text-primary",

    column:
      "border-primary/10",

    over:
      "ring-2 ring-primary/10",
  },

  {
    id: "last",

    title: "Guías Nuevos",

    subtitle:
      "Guías pendientes de consolidar experiencia",

    Icon: UserRoundPlus,

    accent:
      "bg-violet-500 dark:bg-violet-400",

    iconStyle:
      "bg-violet-500/10 text-violet-600 dark:text-violet-300",

    column:
      "border-violet-500/10",

    over:
      "ring-2 ring-violet-500/10",
  },
];

export const TIER_IDS: GuideTier[] = [
  "top",
  "standard",
  "last",
];

export function tierOf(
  guide: {
    tier?: GuideTier | null;
  },
): GuideTier {
  return guide.tier ?? "standard";
}
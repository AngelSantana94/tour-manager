import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { TierConfig } from "./GuideTiers";

interface GuideTierColumnProps {
  tier: TierConfig;
  count: number;
  children: ReactNode;
}

export default function GuideTierColumn({
  tier,
  count,
  children,
}: GuideTierColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: tier.id,
  });

  const { Icon } = tier;

  return (
    <section
      ref={setNodeRef}
      className={[
        "group relative overflow-hidden rounded-3xl",
        "border border-base-content/[0.08]",
        "bg-base-100 [html[data-theme='light']_&]:bg-white",
        "shadow-sm",
        "transition-all duration-200",
        isOver
          ? "border-primary/40 shadow-lg shadow-primary/5"
          : "hover:border-base-content/[0.12]",
      ].join(" ")}
    >
      {/* Línea superior dinámica */}
      <div
        className={[
          "absolute inset-x-0 top-0 h-[3px]",
          tier.accent,
          "opacity-80",
        ].join(" ")}
      />

      {/* HEADER */}
      <header className="flex items-center gap-3 px-5 py-4 sm:px-6 sm:py-5">
        <div
          className={[
            "flex h-10 w-10 shrink-0 items-center justify-center",
            "rounded-xl",
            tier.iconStyle,
            "border border-base-content/[0.06]",
          ].join(" ")}
        >
          <Icon size={18} strokeWidth={2.2} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-bold tracking-tight text-base-content">
              {tier.title}
            </h2>

            <span className="hidden rounded-full bg-base-content/[0.05] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-base-content/40 sm:inline-flex">
              Guías
            </span>
          </div>

          <p className="mt-0.5 truncate text-[11px] leading-tight text-base-content/40">
            {tier.subtitle}
          </p>
        </div>

        <div
          className={[
            "flex h-8 min-w-8 shrink-0 items-center justify-center",
            "rounded-full px-2.5",
            "bg-base-content/[0.05]",
            "text-xs font-bold tabular-nums",
            "text-base-content/60",
          ].join(" ")}
        >
          {count}
        </div>
      </header>

      {/* GUÍAS */}
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {count > 0 ? (
          <div
            className={[
              "grid gap-3",
              "grid-cols-1",
              "sm:grid-cols-2",
              "xl:grid-cols-3",
              "2xl:grid-cols-4",
            ].join(" ")}
          >
            {children}
          </div>
        ) : (
          <div
            className={[
              "flex min-h-[112px] items-center justify-center",
              "rounded-2xl",
              "border border-dashed border-base-content/[0.12]",
              "bg-base-content/[0.015]",
              "transition-colors",
              isOver ? "border-primary/30 bg-primary/[0.03]" : "",
            ].join(" ")}
          >
            <div className="text-center">
              <div className="text-xs font-medium text-base-content/40">
                Suelta un guía aquí
              </div>

              <div className="mt-1 text-[10px] text-base-content/25">
                Arrastra cualquier guía a esta sección
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

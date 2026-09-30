import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  pointerWithin,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../login/AuthContext";

import GuideButton from "./GuideButton";
import GuideDetailView from "./GuideDetailView";
import GuideTierColumn from "./GuideTierColumn";
import DraggableGuide from "./Draggablesuide";
import { TIERS, TIER_IDS, tierOf, type GuideTier } from "./GuideTiers";

interface Guide {
  id: string;
  name: string;
  email: string | null;
  city: string | null;
  languages: string[] | null;
  phone: string | null;
  fixed_days: string[] | null;
  notes: string | null;
  user_id: string | null;
  created_at: string | null;

  // Categoría del guía.
  // null/ausente = standard.
  tier?: GuideTier | null;

  // Orden manual dentro de cada categoría.
  sort_order?: number | null;
}

interface GuidesViewProps {
  onSelectGuide?: (id: string) => void;
}

/**
 * Detección de colisión:
 *
 * 1. Primero intentamos detectar exactamente qué elemento está debajo
 *    del puntero.
 * 2. Si no encontramos nada, usamos closestCenter como fallback.
 *
 * Esto hace que sea mucho más fácil soltar una tarjeta dentro de otra
 * categoría sin tener que acertar exactamente con el centro de la sección.
 */
const collisionDetectionStrategy: CollisionDetection = (args) => {
  const pointerIntersections = pointerWithin(args);

  if (pointerIntersections.length > 0) {
    return pointerIntersections;
  }

  return closestCenter(args);
};

export default function GuidesView({ onSelectGuide }: GuidesViewProps) {
  const { user, isAdmin } = useAuth();

  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);

  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  /*
   * Para un guía necesitamos encontrar UNA SOLA cosa:
   *
   * guides.id correspondiente al usuario que acaba de iniciar sesión.
   *
   * Relación:
   *
   * guides.user_id -> profiles.id -> auth.users.id
   *
   * El admin no necesita esta búsqueda porque sí debe cargar
   * todos los guías y todos los tiers.
   */
  const [myGuideId, setMyGuideId] = useState<string | null>(null);
  const [myGuideLoading, setMyGuideLoading] = useState(false);
  const [myGuideError, setMyGuideError] = useState<string | null>(null);

  // Tras soltar una tarjeta, el navegador puede disparar un click sobre ella.
  // Se ignora durante unos milisegundos para que no abra el detalle sin querer.
  const justDragged = useRef(false);

  // Ratón: el arrastre empieza tras mover 8px.
  // Táctil: hay que mantener pulsado 200ms para no interferir con el scroll.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
  );

  /*
   * ============================================================
   * GUÍA: BUSCAR SU PROPIO REGISTRO
   * ============================================================
   *
   * Esto ocurre únicamente cuando el usuario NO es admin.
   *
   * Importante:
   * todavía NO cargamos todos los guías.
   * Primero averiguamos cuál es el guide.id del usuario actual.
   */
  useEffect(() => {
    if (isAdmin) {
      setMyGuideId(null);
      setMyGuideLoading(false);
      setMyGuideError(null);
      return;
    }

    if (!user) {
      setMyGuideId(null);
      setMyGuideLoading(false);
      setMyGuideError("No se encontró el usuario autenticado.");
      return;
    }

    let cancelled = false;

    async function loadMyGuide() {
      setMyGuideLoading(true);
      setMyGuideError(null);

      const { data, error } = await supabase
        .from("guides")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Error buscando el perfil del guía:", error);

        setMyGuideId(null);
        setMyGuideError("No se pudo cargar tu perfil de guía.");
      } else if (!data) {
        console.error("No se encontró un guía asociado al usuario:", user.id);

        setMyGuideId(null);
        setMyGuideError(
          "No se encontró tu perfil de guía. Contacta con el administrador.",
        );
      } else {
        setMyGuideId(data.id);
      }

      setMyGuideLoading(false);
    }

    void loadMyGuide();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, user?.id]);

  /*
   * ============================================================
   * ADMIN: CARGAR TODOS LOS GUÍAS
   * ============================================================
   *
   * Esta función sigue siendo exactamente la lógica que ya tenías.
   *
   * Los guías NO necesitan ejecutar esta carga porque ellos no
   * deben llegar a la vista de tiers.
   */
  const loadGuides = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) {
      setLoading(true);
    }

    setError(null);

    const { data, error } = await supabase
      .from("guides")
      .select("*")
      .order("sort_order", {
        ascending: true,
        nullsFirst: false,
      })
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.error("Error cargando guías:", error);

      // En un refresco silencioso conservamos la lista que ya había.
      if (showSpinner) {
        setError("No se pudieron cargar las guías.");
        setGuides([]);
      }
    } else {
      setGuides((data as Guide[]) ?? []);
    }

    setLoading(false);
  }, []);

  /*
   * Solo el ADMIN carga la lista completa.
   *
   * Esto es importante:
   * el guía no necesita traer todos los registros de guides.
   */
  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    void loadGuides(true);
  }, [isAdmin, loadGuides]);

  // El aviso de error al mover se cierra solo.
  useEffect(() => {
    if (!moveError) return;

    const timer = setTimeout(() => {
      setMoveError(null);
    }, 5000);

    return () => clearTimeout(timer);
  }, [moveError]);

  /**
   * Guías agrupados por categoría.
   *
   * Dentro de cada categoría se respeta sort_order.
   * Si dos guías tienen el mismo/null sort_order, created_at sirve
   * como fallback estable.
   */
  const byTier = useMemo(() => {
    const out: Record<GuideTier, Guide[]> = {
      top: [],
      standard: [],
      last: [],
    };

    for (const guide of guides) {
      out[tierOf(guide)].push(guide);
    }

    for (const tier of TIER_IDS) {
      out[tier].sort((a, b) => {
        const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        const dateA = a.created_at
          ? new Date(a.created_at).getTime()
          : Number.MAX_SAFE_INTEGER;

        const dateB = b.created_at
          ? new Date(b.created_at).getTime()
          : Number.MAX_SAFE_INTEGER;

        return dateA - dateB;
      });
    }

    return out;
  }, [guides]);

  /**
   * El color del avatar depende de la posición original en la lista.
   * Así no cambia simplemente porque el guía cambie de categoría.
   */
  const indexById = useMemo(() => {
    const map = new Map<string, number>();

    guides.forEach((guide, index) => {
      map.set(guide.id, index);
    });

    return map;
  }, [guides]);

  const activeGuide = useMemo(
    () => guides.find((guide) => guide.id === activeId) ?? null,
    [guides, activeId],
  );

  /**
   * Guarda el orden completo de una categoría.
   *
   * Se escribe:
   *
   *   primer guía  -> sort_order 0
   *   segundo      -> sort_order 1
   *   tercero      -> sort_order 2
   *   ...
   *
   * También guarda el tier para permitir mover guías entre categorías.
   */
  async function saveTierOrder(
    tier: GuideTier,
    orderedGuides: Guide[],
  ): Promise<boolean> {
    if (orderedGuides.length === 0) {
      return true;
    }

    const updates = orderedGuides.map((guide, index) =>
      supabase
        .from("guides")
        .update({
          tier,
          sort_order: index,
        })
        .eq("id", guide.id),
    );

    const results = await Promise.all(updates);

    const failed = results.find((result) => result.error);

    if (failed?.error) {
      console.error("Error guardando orden de guías:", failed.error);
      return false;
    }

    return true;
  }

  /**
   * Reordena/mueve un guía.
   *
   * Puede ocurrir:
   *
   * 1. Dentro de la misma categoría:
   *    4º -> 2º
   *
   * 2. A otra categoría:
   *    Standard -> Vivalux
   *
   * 3. A otra categoría colocándolo delante de un guía concreto.
   */
  async function moveGuide(
    guideId: string,
    targetTier: GuideTier,
    overGuideId?: string,
  ) {
    const previousGuides = guides;

    const sourceGuide = guides.find((guide) => guide.id === guideId);

    if (!sourceGuide) {
      return;
    }

    const sourceTier = tierOf(sourceGuide);

    // Creamos copias independientes para trabajar sin mutar el estado.
    const nextByTier: Record<GuideTier, Guide[]> = {
      top: [...byTier.top],
      standard: [...byTier.standard],
      last: [...byTier.last],
    };

    // Quitamos primero el guía de su categoría actual.
    nextByTier[sourceTier] = nextByTier[sourceTier].filter(
      (guide) => guide.id !== guideId,
    );

    // Lo insertamos en la categoría destino.
    const destinationList = [...nextByTier[targetTier]];

    const guideToMove: Guide = {
      ...sourceGuide,
      tier: targetTier,
    };

    let insertIndex = destinationList.length;

    if (overGuideId && overGuideId !== guideId) {
      const targetIndex = destinationList.findIndex(
        (guide) => guide.id === overGuideId,
      );

      if (targetIndex !== -1) {
        insertIndex = targetIndex;
      }
    }

    destinationList.splice(insertIndex, 0, guideToMove);

    nextByTier[targetTier] = destinationList;

    // Reconstruimos la lista completa manteniendo el orden de las secciones.
    const nextGuides = TIER_IDS.flatMap((tier) => nextByTier[tier]);

    // Estado optimista: la UI cambia inmediatamente.
    setGuides(
      nextGuides.map((guide) => ({
        ...guide,
        tier: tierOf(guide),
      })),
    );

    // Guardamos las dos categorías implicadas.
    const tiersToSave =
      sourceTier === targetTier ? [targetTier] : [sourceTier, targetTier];

    const saveResults = await Promise.all(
      tiersToSave.map((tier) => saveTierOrder(tier, nextByTier[tier])),
    );

    const failed = saveResults.some((result) => !result);

    if (failed) {
      console.error("No se pudo guardar el movimiento del guía.");

      // Volvemos al estado anterior si Supabase falla.
      setGuides(previousGuides);

      setMoveError(
        `No se pudo mover a ${sourceGuide.name}. Inténtalo de nuevo.`,
      );

      return;
    }

    // Actualizamos sort_order localmente para que la UI quede exactamente
    // alineada con lo que acabamos de guardar en Supabase.
    setGuides((currentGuides) => {
      const updated = new Map<string, Guide>();

      currentGuides.forEach((guide) => {
        updated.set(guide.id, guide);
      });

      for (const tier of TIER_IDS) {
        nextByTier[tier].forEach((guide, index) => {
          const current = updated.get(guide.id);

          if (current) {
            updated.set(guide.id, {
              ...current,
              tier,
              sort_order: index,
            });
          }
        });
      }

      return Array.from(updated.values());
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);

    justDragged.current = true;

    setTimeout(() => {
      justDragged.current = false;
    }, 50);

    const { active, over } = event;

    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    const guide = guides.find((item) => item.id === activeId);

    if (!guide) {
      return;
    }

    /**
     * Caso 1:
     * Se ha soltado directamente sobre una sección.
     *
     * Los IDs de las secciones son:
     *   top
     *   standard
     *   last
     */
    if (TIER_IDS.includes(overId as GuideTier)) {
      const targetTier = overId as GuideTier;

      // Si ya está en esa categoría y no hay una tarjeta concreta
      // sobre la que colocarlo, no hay nada que hacer.
      if (tierOf(guide) === targetTier) {
        return;
      }

      void moveGuide(activeId, targetTier);
      return;
    }

    /**
     * Caso 2:
     * Se ha soltado sobre otra tarjeta.
     *
     * Esa tarjeta determina:
     *   - la categoría destino
     *   - la posición donde insertar
     */
    const overGuide = guides.find((item) => item.id === overId);

    if (!overGuide) {
      return;
    }

    const targetTier = tierOf(overGuide);

    // Si se suelta sobre sí misma, no hacemos nada.
    if (activeId === overId) {
      return;
    }

    void moveGuide(activeId, targetTier, overId);
  }

  const handleSelectGuide = (id: string) => {
    if (justDragged.current) {
      return;
    }

    setSelectedGuideId(id);
    onSelectGuide?.(id);
  };

  /*
   * ============================================================
   * AQUÍ ESTÁ LA DECISIÓN ADMIN VS GUIDE
   * ============================================================
   *
   * Para un guía:
   *
   *   NO renderizamos:
   *   - byTier
   *   - DndContext
   *   - GuideTierColumn
   *   - todas las tarjetas
   *   - DragOverlay
   *
   * Directamente mostramos su GuideDetailView.
   */

  if (!isAdmin) {
    if (myGuideLoading) {
      return (
        <div className="flex items-center justify-center h-64 gap-3 opacity-30">
          <span className="loading loading-spinner loading-sm" />

          <span className="text-sm">Cargando tu perfil...</span>
        </div>
      );
    }

    if (myGuideError) {
      return (
        <div className="flex items-center justify-center h-64 px-4">
          <div className="text-sm text-error text-center">{myGuideError}</div>
        </div>
      );
    }

    if (!myGuideId) {
      return (
        <div className="flex items-center justify-center h-64 px-4">
          <div className="text-sm text-error text-center">
            No se encontró tu perfil de guía.
          </div>
        </div>
      );
    }

    return (
      <GuideDetailView
        guideId={myGuideId}
        onBack={() => {
          /*
           * Un guía no debe volver a GuidesView porque eso
           * volvería a mostrar los tiers internos.
           *
           * El botón de volver deberá desaparecer en GuideDetailView
           * para los usuarios que no sean admin.
           */
        }}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VISTA DE DETALLE — ADMIN
  // ─────────────────────────────────────────────────────────────

  if (selectedGuideId) {
    return (
      <GuideDetailView
        guideId={selectedGuideId}
        onBack={() => {
          setSelectedGuideId(null);
          void loadGuides(false);
        }}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────
  // LOADING — ADMIN
  // ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 opacity-30">
        <span className="loading loading-spinner loading-sm" />

        <span className="text-sm">Cargando guías...</span>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // ERROR — ADMIN
  // ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-error">{error}</div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VISTA PRINCIPAL — ADMIN
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-base-content tracking-tight">
            Guías
          </h1>

          <p className="text-xs opacity-40 mt-0.5">
            {guides.length} guía{guides.length !== 1 ? "s" : ""} registrada
            {guides.length !== 1 ? "s" : ""} · Arrastra las tarjetas para
            cambiar su categoría o posición
          </p>
        </div>

        {/* Preparado para la siguiente fase. */}
        <button
          type="button"
          disabled
          className="btn btn-primary btn-sm gap-2"
          title="Disponible en la siguiente fase"
        >
          <Plus size={16} />
          Añadir nuevo guía
        </button>
      </div>

      {guides.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 opacity-20">
          <span className="text-4xl">👤</span>
          <span className="text-sm">Sin guías registradas</span>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveId(null);
          }}
        >
          {/* Las categorías son secciones verticales.
              Cada sección contiene sus tarjetas en su propio grid. */}
          <div className="flex flex-col gap-4">
            {TIERS.map((tier) => (
              <GuideTierColumn
                key={tier.id}
                tier={tier}
                count={byTier[tier.id].length}
              >
                {byTier[tier.id].map((guide) => (
                  <DraggableGuide key={guide.id} id={guide.id}>
                    <GuideButton
                      id={guide.id}
                      name={guide.name}
                      email={guide.email}
                      index={indexById.get(guide.id) ?? 0}
                      hasAccount={guide.user_id !== null}
                      onClick={handleSelectGuide}
                    />
                  </DraggableGuide>
                ))}
              </GuideTierColumn>
            ))}
          </div>

          {/* Copia flotante de la tarjeta mientras se arrastra */}
          <DragOverlay
            dropAnimation={{
              duration: 180,
              easing: "ease-out",
            }}
          >
            {activeGuide ? (
              <div className="cursor-grabbing rotate-1 scale-[1.03] rounded-2xl shadow-xl">
                <GuideButton
                  id={activeGuide.id}
                  name={activeGuide.name}
                  email={activeGuide.email}
                  index={indexById.get(activeGuide.id) ?? 0}
                  hasAccount={activeGuide.user_id !== null}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Aviso si falla el guardado */}
      {moveError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="alert alert-error text-sm shadow-lg">
            <span>{moveError}</span>
          </div>
        </div>
      )}
    </div>
  );
}

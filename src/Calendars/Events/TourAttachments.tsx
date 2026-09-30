import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  FileText,
  ExternalLink,
  Loader2,
  CheckCircle2,
  X,
} from "lucide-react";
import {
  fetchTourAttachments,
  fetchTourGuides,
  fetchViewer,
  uploadTourAttachment,
  removeTourAttachment,
  completeTour,
  type AttachmentKind,
  type TourAttachmentsData,
  type TourGuide,
  type TourPhotos,
  type Viewer,
} from "./Services/TourAttachments.adapter";

interface TourAttachmentsProps {
  tourId: string;
}

interface KindConfig {
  kind: AttachmentKind;
  label: string;
  itemLabel: string;
  icon: React.ReactNode;
  accept: string;
}

const KINDS: KindConfig[] = [
  {
    kind: "pax_photo",
    label: "Foto de grupo",
    itemLabel: "Foto",
    icon: <Camera size={15} />,
    accept: "image/*",
  },
  {
    kind: "voucher_photo",
    label: "Voucher",
    itemLabel: "Voucher",
    icon: <FileText size={15} />,
    accept: "image/*,application/pdf",
  },
];

const LABEL_BY_SLOT: Record<TourGuide["slot"], string> = {
  lead: "Guía Lead",
  backup1: "Back-up 1",
  backup2: "Back-up 2",
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function formatCompletedAt(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── FILA (un tipo de adjunto de un guía) ───────────────────────────────────
function PhotoRow({
  config,
  urls,
  canManage,
  onUpload,
  onRemove,
}: {
  config: KindConfig;
  urls: string[];
  canManage: boolean;
  onUpload: (file: File) => Promise<void>;
  onRemove: (url: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // De uno en uno: cada subida es atómica en el servidor.
      for (const file of Array.from(files)) {
        await onUpload(file);
      }
    } catch (err) {
      console.error(`Error subiendo ${config.label}:`, err);
      setError(errorMessage(err, "No se pudo subir. Inténtalo de nuevo."));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove(url: string) {
    setBusy(true);
    setError(null);
    try {
      await onRemove(url);
    } catch (err) {
      console.error(`Error quitando ${config.label}:`, err);
      setError(errorMessage(err, "No se pudo quitar."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-3 px-5 py-3 border-b border-base-content/5 last:border-none">
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-cyan-100 text-cyan-600">
        {config.icon}
      </div>
      <span className="text-[11px] font-bold opacity-40 uppercase tracking-wide w-28 shrink-0 pt-2.5">
        {config.label}
      </span>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5 pt-1.5">
        {urls.length === 0 ? (
          <span className="text-sm opacity-40">Sin subir</span>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {urls.map((url, i) => (
              <span key={url} className="flex items-center gap-1">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-cyan-700 hover:text-cyan-800 flex items-center gap-1"
                >
                  {config.itemLabel} {i + 1}
                  <ExternalLink size={13} />
                </a>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleRemove(url)}
                    disabled={busy}
                    title="Quitar"
                    className="opacity-30 hover:opacity-70 disabled:opacity-20"
                  >
                    <X size={13} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {error && <span className="text-xs text-error">{error}</span>}
      </div>

      {canManage && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="btn btn-ghost btn-xs disabled:opacity-40 mt-1.5"
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : urls.length > 0 ? (
              "Añadir otra"
            ) : (
              "Subir"
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={config.accept}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </>
      )}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────
export default function TourAttachments({ tourId }: TourAttachmentsProps) {
  const [data, setData] = useState<TourAttachmentsData | null>(null);
  const [guides, setGuides] = useState<TourGuide[] | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [attachments, tourGuides, who] = await Promise.all([
        fetchTourAttachments(tourId),
        fetchTourGuides(tourId),
        fetchViewer(),
      ]);
      setData(attachments);
      setGuides(tourGuides);
      setViewer(who);
    } catch (err) {
      console.error("Error cargando adjuntos:", err);
      setLoadError(errorMessage(err, "No se pudieron cargar los adjuntos."));
    }
  }, [tourId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <div className="border-t-8 border-base-200/40 px-5 py-4 flex items-center gap-3">
        <span className="text-sm text-error">{loadError}</span>
        <button type="button" onClick={load} className="btn btn-ghost btn-xs">
          Reintentar
        </button>
      </div>
    );
  }

  if (!data || !guides || !viewer) {
    return (
      <div className="border-t-8 border-base-200/40 px-5 py-4">
        <Loader2 size={16} className="animate-spin opacity-40" />
      </div>
    );
  }

  // Una sección por guía asignado (si la misma persona ocupa dos puestos,
  // solo aparece una vez, con el primer puesto).
  const sections: { label: string; guide: { id: string; name: string } }[] = [];
  for (const g of guides) {
    if (!sections.some((s) => s.guide.id === g.id)) {
      sections.push({
        label: LABEL_BY_SLOT[g.slot],
        guide: { id: g.id, name: g.name },
      });
    }
  }

  // Sin guías asignados no hay nada que subir todavía.
  if (sections.length === 0) return null;

  const leadId = guides.find((g) => g.slot === "lead")?.id ?? null;
  const isCompleted = !!data.completedAt;

  // Todos ven todas las secciones; solo el dueño (o la coordinadora) edita.
  const canManage = (guideId: string) =>
    !isCompleted && (viewer.isAdmin || viewer.guideId === guideId);
  const isOwnSection = (guideId: string) => viewer.guideId === guideId;

  // El guía lead o la coordinadora son quienes cierran el tour.
  const canFinish =
    !isCompleted &&
    (viewer.isAdmin || (leadId !== null && viewer.guideId === leadId));
  const allUploaded = sections.every(
    (s) =>
      (data.pax[s.guide.id]?.length ?? 0) > 0 &&
      (data.voucher[s.guide.id]?.length ?? 0) > 0,
  );

  function applyPhotos(photos: TourPhotos) {
    setData((prev) => (prev ? { ...prev, ...photos } : prev));
  }

  async function handleComplete() {
    setCompleting(true);
    setCompleteError(null);
    try {
      const iso = await completeTour(tourId);
      setData((prev) => (prev ? { ...prev, completedAt: iso } : prev));
    } catch (err) {
      console.error("Error finalizando el tour:", err);
      setCompleteError(errorMessage(err, "No se pudo finalizar el tour."));
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="border-t-8 border-base-200/40">
      {sections.map(({ label, guide }) => (
        <div key={guide.id} className="border-b border-base-content/10">
          <div className="px-5 pt-3 pb-1 flex items-center gap-2 text-xs font-black uppercase tracking-wide opacity-60">
            <span>
              {label}: {guide.name}
            </span>
            {isOwnSection(guide.id) && (
              <span className="badge badge-xs badge-outline normal-case font-semibold">
                Tú
              </span>
            )}
          </div>
          {KINDS.map((config) => {
            const byGuide =
              config.kind === "pax_photo" ? data.pax : data.voucher;
            return (
              <PhotoRow
                key={config.kind}
                config={config}
                urls={byGuide[guide.id] ?? []}
                canManage={canManage(guide.id)}
                onUpload={async (file) =>
                  applyPhotos(
                    await uploadTourAttachment(
                      tourId,
                      config.kind,
                      file,
                      guide.id,
                    ),
                  )
                }
                onRemove={async (url) =>
                  applyPhotos(
                    await removeTourAttachment(
                      tourId,
                      config.kind,
                      url,
                      guide.id,
                    ),
                  )
                }
              />
            );
          })}
        </div>
      ))}

      <div className="flex items-center gap-3 px-5 py-3.5">
        {isCompleted ? (
          <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold">
            <CheckCircle2 size={16} />
            Tour completado · {formatCompletedAt(data.completedAt!)}
          </div>
        ) : canFinish ? (
          <>
            <button
              type="button"
              onClick={handleComplete}
              disabled={!allUploaded || completing}
              title={
                allUploaded
                  ? undefined
                  : "Todos los guías deben subir foto de grupo y voucher"
              }
              className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-none disabled:bg-base-300 disabled:text-base-content/40"
            >
              {completing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                "Finalizar tour"
              )}
            </button>
            {completeError && (
              <span className="text-xs text-error">{completeError}</span>
            )}
          </>
        ) : (
          <span className="text-xs opacity-40">
            El guía lead o la coordinadora finalizan el tour cuando todos hayan
            subido sus archivos.
          </span>
        )}
      </div>
    </div>
  );
}
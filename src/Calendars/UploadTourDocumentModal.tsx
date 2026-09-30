import { useState } from "react";
import {
  X,
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

interface UploadTourDocumentModalProps {
  onClose: () => void;
}

interface ParsedRowPreview {
  service_id: string;
  date: string | null;
  start_time: string | null;
  timePeriod: "AM" | "PM" | "NT";
  pax: number | null;
  tour_leader_phone: string | null;
  operatorName: string | null;
  leaderName: string | null;
  providerName: string;
}

interface SheetPreview {
  rowCount: number;
  sample: ParsedRowPreview[];
  skipped: { row: number; reason: string }[];
  missingColumns: string[];
  error?: string;
}

type Step = "pick" | "loading" | "preview" | "confirming" | "done" | "error";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // "data:...;base64,XXXX" -> solo la parte de después de la coma
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function UploadTourDocumentModal({
  onClose,
}: UploadTourDocumentModalProps) {
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, SheetPreview>>({});
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmSummary, setConfirmSummary] = useState<{
    inserted: number;
    totalParsed: number;
    unmatchedOperators: string[];
    errors: string[];
  } | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (!f) return;

    setStep("loading");
    setErrorMsg(null);
    try {
      const b64 = await fileToBase64(f);
      setFileBase64(b64);

      const { data, error } = await supabase.functions.invoke(
        "import-tour-document",
        {
          body: { action: "preview", fileBase64: b64 },
        },
      );
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setSheetNames(data.sheetNames ?? []);
      setResults(data.results ?? {});
      setSelectedSheet((data.sheetNames ?? [])[0] ?? "");
      setStep("preview");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error leyendo el archivo.",
      );
      setStep("error");
    }
  }

  async function handleConfirm() {
    if (!fileBase64 || !selectedSheet) return;
    setStep("confirming");
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "import-tour-document",
        {
          body: { action: "confirm", fileBase64, sheetName: selectedSheet },
        },
      );
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data.errors?.length) throw new Error(data.errors.join(" | "));

      setConfirmSummary({
        inserted: data.inserted,
        totalParsed: data.totalParsed,
        unmatchedOperators: data.unmatchedOperators ?? [],
        errors: data.errors ?? [],
      });
      setStep("done");
      // No hace falta refrescar el calendario a mano: la suscripción Realtime
      // que ya tiene useSupabaseEvents recoge los tours nuevos sola.
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error guardando los tours.",
      );
      setStep("error");
    }
  }

  const current = results[selectedSheet];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== "confirming") onClose();
      }}
    >
      <div className="bg-base-100 rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <h2 className="text-lg font-bold">
            {step === "preview" && current && !current.error
              ? `Se han cargado ${current.rowCount} tour${current.rowCount !== 1 ? "s" : ""}`
              : "Cargar documento"}
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-xs btn-square">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 flex flex-col gap-4 overflow-y-auto">
          {/* ── Paso 1: elegir archivo ── */}
          {(step === "pick" || step === "loading") && (
            <>
              <p className="text-xs opacity-60">
                Sube el Excel que envía Bespoke (formato GRUPO / TTL PAX / TOUR
                LEADER / TEL. / BRUJAS / HR). Verás una vista previa antes de
                que se guarde nada. Las filas con Tour Leader "Cancelado" se
                descartan automáticamente.
              </p>
              <label className="border-2 border-dashed border-base-content/15 rounded-2xl p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/40 hover:bg-base-200/30 transition-colors">
                {step === "loading" ? (
                  <span className="loading loading-spinner loading-md text-primary" />
                ) : (
                  <FileSpreadsheet size={28} className="opacity-40" />
                )}
                <span className="text-sm font-medium opacity-70">
                  {step === "loading"
                    ? "Leyendo archivo..."
                    : file
                      ? file.name
                      : "Haz clic para elegir un archivo"}
                </span>
                <span className="text-[11px] opacity-40">.xlsx</span>
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  disabled={step === "loading"}
                  onChange={handleFileChange}
                />
              </label>
            </>
          )}

          {/* ── Paso 2: vista previa ── */}
          {step === "preview" && (
            <>
              {sheetNames.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm opacity-50 shrink-0">Hoja:</span>
                  <select
                    value={selectedSheet}
                    onChange={(e) => setSelectedSheet(e.target.value)}
                    className="select select-bordered select-sm flex-1"
                  >
                    {sheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                        {results[name]?.rowCount != null
                          ? ` (${results[name].rowCount} tours)`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {current?.error && (
                <div className="flex items-center gap-2 text-sm text-error bg-error/10 rounded-lg px-3 py-2">
                  <AlertTriangle size={15} className="shrink-0" />
                  {current.error}
                </div>
              )}

              {current?.missingColumns.length ? (
                <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 rounded-lg px-3 py-2">
                  <AlertTriangle size={15} className="shrink-0" />
                  Columnas no encontradas: {current.missingColumns.join(", ")}
                </div>
              ) : null}

              {current?.skipped.length ? (
                <div className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2 max-h-24 overflow-y-auto">
                  {current.skipped.length} fila
                  {current.skipped.length !== 1 ? "s" : ""} omitida
                  {current.skipped.length !== 1 ? "s" : ""}:{" "}
                  {current.skipped
                    .map((s) => `fila ${s.row} (${s.reason})`)
                    .join(" · ")}
                </div>
              ) : null}

              {current && !current.error && (
                // Tabla de solo lectura — cualquier corrección se hace ya
                // desplegado el tour, no aquí. Scroll en ambos ejes para
                // que quepa bien en móvil.
                <div className="border border-base-content/10 rounded-xl overflow-auto max-h-[45vh]">
                  <table className="table table-sm table-pin-rows">
                    <thead>
                      <tr className="text-[11px] uppercase opacity-50">
                        <th>Grupo</th>
                        <th>Fecha</th>
                        <th>Hora</th>
                        <th>Pax</th>
                        <th>Tour Leader</th>
                        <th>Teléfono</th>
                        <th>Proveedor</th>
                        <th>Operador</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.sample.map((r) => (
                        <tr key={r.service_id}>
                          <td className="font-mono text-xs whitespace-nowrap">
                            {r.service_id}
                          </td>
                          <td
                            className={[
                              "whitespace-nowrap",
                              !r.date ? "text-error" : "",
                            ].join(" ")}
                          >
                            {r.date ?? "—"}
                          </td>
                          <td className="whitespace-nowrap">
                            {r.start_time ? r.start_time.slice(0, 5) : "—"}
                            {r.timePeriod !== "NT" && (
                              <span className="opacity-40 text-[10px] ml-1">
                                {r.timePeriod}
                              </span>
                            )}
                            {r.timePeriod === "NT" && (
                              <span className="opacity-40 text-[10px] ml-1">
                                NT
                              </span>
                            )}
                          </td>
                          <td>{r.pax ?? "—"}</td>
                          <td className="whitespace-nowrap">
                            {r.leaderName ?? "—"}
                          </td>
                          <td className="whitespace-nowrap">
                            {r.tour_leader_phone ?? "—"}
                          </td>
                          <td className="whitespace-nowrap">
                            {r.providerName}
                          </td>
                          <td
                            className={[
                              "whitespace-nowrap",
                              !r.operatorName ? "text-warning" : "",
                            ].join(" ")}
                          >
                            {r.operatorName ?? "Sin operador"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Paso 3: confirmando ── */}
          {step === "confirming" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <span className="loading loading-spinner loading-md text-primary" />
              <span className="text-sm opacity-60">Guardando tours...</span>
            </div>
          )}

          {/* ── Paso 4: hecho ── */}
          {step === "done" && confirmSummary && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-success bg-success/10 rounded-lg px-3 py-2 text-sm">
                <CheckCircle2 size={16} className="shrink-0" />
                {confirmSummary.inserted} de {confirmSummary.totalParsed} tours
                guardados.
              </div>
              {confirmSummary.unmatchedOperators.length > 0 && (
                <div className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">
                  Operadores creados/sin resolver:{" "}
                  {confirmSummary.unmatchedOperators.join(", ")}
                </div>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {step === "error" && errorMsg && (
            <div className="flex items-center gap-2 text-sm text-error bg-error/10 rounded-lg px-3 py-2">
              <AlertTriangle size={15} className="shrink-0" />
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="grid grid-cols-2 gap-3 px-5 pb-5 pt-1 shrink-0">
          {step === "done" ? (
            <button
              onClick={onClose}
              className="btn bg-base-content text-base-100 border-none col-span-2"
            >
              Cerrar
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={step === "confirming"}
                className="btn btn-outline border-base-content/20 disabled:opacity-30"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={step !== "preview" || !current || !!current.error}
                className="btn bg-base-content text-base-100 border-none disabled:opacity-30 gap-2"
              >
                <Upload size={15} />
                Confirmar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

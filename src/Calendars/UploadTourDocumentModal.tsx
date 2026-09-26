import { useState } from "react";
import { X, FileSpreadsheet, Upload } from "lucide-react";

interface UploadTourDocumentModalProps {
  onClose: () => void;
}

// PENDIENTE: esto todavía no procesa el archivo — solo deja elegirlo. La
// lectura real del Excel (columnas GRUPO/TTL PAX/TOUR LEADER/TEL./BRUJAS/
// HR/BRUSELAS/HR) y su volcado a `tours` se construye en la siguiente ronda,
// probablemente como una edge function nueva (mismo patrón que
// sync-google-sheets) en vez de parsear en el navegador.
export default function UploadTourDocumentModal({ onClose }: UploadTourDocumentModalProps) {
  const [file, setFile] = useState<File | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-base-100 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <h2 className="text-lg font-bold">Cargar documento</h2>
          <button onClick={onClose} className="btn btn-ghost btn-xs btn-square">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          <p className="text-xs opacity-60">
            Sube el Excel que te envía el cliente (formato GRUPO / TTL PAX / TOUR
            LEADER / TEL. / BRUJAS / HR). De momento solo se selecciona el
            archivo — la extracción automática de tours llega en la siguiente
            fase.
          </p>

          <label className="border-2 border-dashed border-base-content/15 rounded-2xl p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/40 hover:bg-base-200/30 transition-colors">
            <FileSpreadsheet size={28} className="opacity-40" />
            <span className="text-sm font-medium opacity-70">
              {file ? file.name : "Haz clic para elegir un archivo"}
            </span>
            <span className="text-[11px] opacity-40">.xlsx</span>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={onClose}
              className="btn btn-outline border-base-content/20"
            >
              Cancelar
            </button>
            <button
              disabled
              title="Próximamente — todavía no procesa el archivo"
              className="btn bg-base-content text-base-100 border-none disabled:opacity-30 gap-2"
            >
              <Upload size={15} />
              Procesar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
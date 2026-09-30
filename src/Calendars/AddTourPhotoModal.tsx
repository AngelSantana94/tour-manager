import { useRef, useState } from "react";
import { X, Camera, ImagePlus, Sparkles } from "lucide-react";

interface AddTourPhotoModalProps {
  onClose: () => void;
}

export default function AddTourPhotoModal({
  onClose,
}: AddTourPhotoModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);

  function handleImage(file: File | null) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      setImage(reader.result as string);
    };

    reader.readAsDataURL(file);
  }

  function handleContinue() {
    /*
     * TODO:
     * Aquí conectaremos la IA/OCR.
     *
     * La idea será:
     * 1. Enviar la imagen a una Edge Function.
     * 2. La IA detectará Grupo, Pax, Tour Leader, Tel.,
     *    Brujas, HR, etc.
     * 3. Devolverá los datos estructurados.
     * 4. Mostraremos el mismo formulario de edición/confirmación
     *    antes de guardar el tour.
     */
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-base-100 rounded-2xl shadow-xl w-full max-w-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-content/10">
          <div>
            <h2 className="text-lg font-bold">Añadir tour desde foto</h2>
            <p className="text-xs opacity-50 mt-0.5">
              Haz una captura o sube una imagen del documento.
            </p>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost btn-xs btn-square"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {!image ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full min-h-64 border-2 border-dashed border-base-content/15 rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-primary/40 hover:bg-base-200/30 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-base-200 flex items-center justify-center">
                <Camera size={22} className="opacity-50" />
              </div>

              <div className="text-center">
                <p className="text-sm font-semibold">
                  Seleccionar captura
                </p>
                <p className="text-xs opacity-50 mt-1">
                  PNG, JPG o WEBP
                </p>
              </div>

              <span className="btn btn-sm btn-outline border-base-content/20 gap-2">
                <ImagePlus size={15} />
                Elegir imagen
              </span>
            </button>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden border border-base-content/10 bg-base-200">
                <img
                  src={image}
                  alt="Documento seleccionado"
                  className="w-full max-h-[50vh] object-contain"
                />
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-primary/10 text-primary px-3 py-3 text-xs">
                <Sparkles size={16} className="shrink-0" />
                <span>
                  La lectura automática mediante IA se conectará aquí.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  className="btn btn-outline border-base-content/20"
                >
                  Cambiar imagen
                </button>

                <button
                  type="button"
                  onClick={handleContinue}
                  className="btn bg-base-content text-base-100 border-none gap-2"
                >
                  <Sparkles size={15} />
                  Continuar
                </button>
              </div>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleImage(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
    </div>
  );
}
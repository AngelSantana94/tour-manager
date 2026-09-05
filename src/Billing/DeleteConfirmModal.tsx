import { AlertCircle } from "lucide-react";

interface DeleteConfirmModalProps {
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function DeleteConfirmModal({
  message = "¿Estás seguro que deseas eliminar este tour?",
  onConfirm,
  onCancel,
  loading = false,
}: DeleteConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-base-100 rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-base-200 flex items-center justify-center shrink-0">
            <AlertCircle size={18} className="opacity-60" />
          </div>
          <p className="text-sm font-semibold leading-snug pt-1.5">
            {message}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={onCancel}
            className="btn btn-outline border-base-content/20"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="btn bg-base-content text-base-100 hover:bg-base-content/85 border-none disabled:opacity-40"
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "Aceptar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
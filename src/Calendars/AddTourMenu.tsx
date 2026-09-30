import { useEffect, useRef, useState } from "react";
import {
  Plus,
  ChevronDown,
  FileSpreadsheet,
  PenLine,
  Camera,
} from "lucide-react";
import UploadTourDocumentModal from "./UploadTourDocumentModal";
import AddTourManualModal from "./AddTourManualModal";
import AddTourPhotoModal from "./AddTourPhotoModal";

interface AddTourMenuProps {
  className?: string;
}

export default function AddTourMenu({ className }: AddTourMenuProps) {
  const [open, setOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div
      ref={ref}
      className={["relative", className].filter(Boolean).join(" ")}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn btn-sm gap-2 px-4 bg-base-content hover:bg-base-content/85 border-none text-base-100 font-semibold"
      >
        <Plus size={16} strokeWidth={2.5} />
        Añadir tour
        <ChevronDown
          size={14}
          className={["transition-transform", open ? "rotate-180" : ""].join(
            " ",
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-base-100 border border-base-content/10 rounded-xl shadow-lg overflow-hidden z-20 flex flex-col py-1">
          <button
            onClick={() => {
              setOpen(false);
              setUploadModalOpen(true);
            }}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium hover:bg-base-200 transition-colors text-left"
          >
            <FileSpreadsheet size={15} className="opacity-60" />
            Cargar documento
          </button>

          <button
            onClick={() => {
              setOpen(false);
              setManualModalOpen(true);
            }}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium hover:bg-base-200 transition-colors text-left"
          >
            <PenLine size={15} className="opacity-60" />
            Añadir manualmente
          </button>

          <button
            onClick={() => {
              setOpen(false);
              setPhotoModalOpen(true);
            }}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium hover:bg-base-200 transition-colors text-left"
          >
            <Camera size={15} className="opacity-60" />
            Añadir desde foto
          </button>
        </div>
      )}

      {uploadModalOpen && (
        <UploadTourDocumentModal onClose={() => setUploadModalOpen(false)} />
      )}

      {manualModalOpen && (
        <AddTourManualModal onClose={() => setManualModalOpen(false)} />
      )}

      {photoModalOpen && (
        <AddTourPhotoModal onClose={() => setPhotoModalOpen(false)} />
      )}
    </div>
  );
}

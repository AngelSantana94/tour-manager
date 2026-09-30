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

// ── EXPORTACIÓN DE TIPOS PARA COMPATIBILIDAD CON BOARDDAY Y OTROS COMPONENTES ──
export interface AddTourOption {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

export interface AddTourMenuProps {
  className?: string;
  options?: AddTourOption[];
}

export default function AddTourMenu({ className, options }: AddTourMenuProps) {
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

  // Opciones por defecto si no se le envían props desde fuera
  const defaultOptions: AddTourOption[] = [
    {
      label: "Cargar documento",
      icon: <FileSpreadsheet size={15} className="opacity-60" />,
      onClick: () => setUploadModalOpen(true),
    },
    {
      label: "Añadir manualmente",
      icon: <PenLine size={15} className="opacity-60" />,
      onClick: () => setManualModalOpen(true),
    },
    {
      label: "Añadir desde foto",
      icon: <Camera size={15} className="opacity-60" />,
      onClick: () => setPhotoModalOpen(true),
    },
  ];

  const menuItems = options && options.length > 0 ? options : defaultOptions;

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
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium hover:bg-base-200 transition-colors text-left"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
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

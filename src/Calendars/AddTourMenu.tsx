import { useEffect, useRef, useState } from "react";
import { Plus, ChevronDown } from "lucide-react";

export interface AddTourOption {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

interface AddTourMenuProps {
  options: AddTourOption[];
  className?: string;
}

export default function AddTourMenu({ options, className }: AddTourMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={["relative", className].filter(Boolean).join(" ")}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn btn-sm gap-2 px-4 bg-base-content hover:bg-base-content/85 border-none text-base-100 font-semibold"
      >
        <Plus size={16} strokeWidth={2.5} />
        Añadir tour
        <ChevronDown
          size={14}
          className={["transition-transform", open ? "rotate-180" : ""].join(" ")}
        />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-56 bg-base-100 border border-base-content/10 rounded-xl shadow-xl overflow-hidden z-50">
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => {
                setOpen(false);
                opt.onClick();
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left hover:bg-base-200/60 transition-colors"
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
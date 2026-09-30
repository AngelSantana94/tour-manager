import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { GuideRef } from "../Services/Supabase.adapter";

const norm = (v: string): string =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

interface GuideComboboxProps {
  guides: GuideRef[];
  placeholder?: string;
  disabled?: boolean;
  onSelect: (guideId: string) => void;
}

// Campo de texto con autocompletado: escribes "fr" y solo quedan los guías
// cuyo nombre contiene "fr" en cualquier parte (no solo al principio, así
// "María Fran..." también aparece si escribes "fran"). Sigue permitiendo
// desplegar y elegir sin escribir nada, como el <select> de antes.
export default function GuideCombobox({
  guides,
  placeholder = "Escribe un nombre o elige de la lista...",
  disabled = false,
  onSelect,
}: GuideComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Altura máxima real del desplegable: max-h-60 (15rem = 240px) + margen.
  const DROPDOWN_HEIGHT = 260;

  // Mide el espacio disponible justo antes de abrir. Se abre hacia arriba
  // solo si de verdad no cabe abajo pero sí arriba — así una fila con
  // espacio de sobra no se voltea sin necesidad.
  function openDropdown() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setOpenUp(spaceBelow < DROPDOWN_HEIGHT && spaceAbove > spaceBelow);
    }
    setOpen(true);
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = norm(query);
    const list = q ? guides.filter((g) => norm(g.name).includes(q)) : guides;
    return list.slice(0, 50); // por si el listado de guías crece mucho
  }, [guides, query]);

  function choose(guide: GuideRef) {
    onSelect(guide.id);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") openDropdown();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) choose(filtered[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onFocus={() => {
            openDropdown();
            setHighlight(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) openDropdown();
            setHighlight(0);
          }}
          onKeyDown={handleKeyDown}
          className="input input-bordered input-sm w-full pr-8 disabled:opacity-40"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openDropdown())}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70"
          aria-label="Desplegar lista de guías"
        >
          <ChevronDown size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
      </div>

      {open && !disabled && (
        <div
          className={[
            "absolute left-0 right-0 max-h-60 overflow-y-auto bg-base-100 border border-base-content/10 rounded-lg shadow-xl z-50",
            openUp ? "bottom-full mb-1" : "top-full mt-1",
          ].join(" ")}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm opacity-50">Sin coincidencias</div>
          ) : (
            filtered.map((g, i) => (
              <button
                key={g.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()} // evita perder el foco antes del click
                onClick={() => choose(g)}
                className={[
                  "w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2",
                  i === highlight ? "bg-base-200" : "hover:bg-base-200/60",
                ].join(" ")}
              >
                <span className="font-medium truncate">{g.name}</span>
                {g.phone && <span className="text-xs opacity-40 shrink-0">{g.phone}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
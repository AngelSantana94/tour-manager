import { useState } from "react";

export type Language = "es" | "nl" | "en";

// Orden fijo: español por defecto, luego neerlandés e inglés.
const LANGUAGES: { value: Language; label: string }[] = [
  { value: "es", label: "ES" },
  { value: "nl", label: "NL" },
  { value: "en", label: "EN" },
];

// PENDIENTE DE CONECTAR: de momento solo cambia el estado local y no afecta a
// ningún texto de la app. Cuando toque, este estado sube a un contexto de idioma.
export default function LanguageSwitch() {
  const [lang, setLang] = useState<Language>("es");

  return (
    <div
      role="group"
      aria-label="Idioma"
      className="flex items-center rounded-full bg-base-300/60 p-0.5"
    >
      {LANGUAGES.map(({ value, label }) => {
        const active = lang === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setLang(value)}
            aria-pressed={active}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
              active
                ? "bg-base-100 text-base-content shadow-sm"
                : "text-base-content/50 hover:text-base-content"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
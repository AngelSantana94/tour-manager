import { ArrowRight } from "lucide-react";

interface GuideButtonProps {
  id: string;
  name: string;
  email?: string | null;
  index: number;
  hasAccount: boolean; // true si guides.user_id no es null
  onClick?: (id: string) => void;
}

const AVATAR_COLORS = [
  "bg-teal-600",
  "bg-blue-600",
  "bg-violet-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-emerald-600",
];

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export default function GuideButton({
  id,
  name,
  email,
  index,
  hasAccount,
  onClick,
}: GuideButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(id)}
      className="group w-full text-left bg-base-100 border border-base-content/10 rounded-2xl p-5 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all cursor-pointer bg-base-100 [html[data-theme='light']_&]:bg-white"
    >
      {/* Avatar */}
      <div
        className={[
          "w-12 h-12 rounded-full flex items-center justify-center",
          "text-white font-bold text-sm shrink-0",
          avatarColor(index),
        ].join(" ")}
      >
        {getInitials(name)}
      </div>

      {/* Información */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-base-content truncate">
            {name}
          </span>
          <span
            className={[
              "text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0",
              hasAccount
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700",
            ].join(" ")}
          >
            {hasAccount ? "Registrado" : "Sin registrar"}
          </span>
        </div>

        {email && (
          <span className="text-xs opacity-40 truncate mt-0.5">{email}</span>
        )}
      </div>

      {/* Flecha */}
      <ArrowRight
        size={17}
        className="shrink-0 opacity-20 group-hover:opacity-70 group-hover:translate-x-0.5 transition-all"
      />
    </button>
  );
}

import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "../login/AuthContext";

const supabase = createClient(
  "https://hccxpmnraefgccowdwri.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY3hwbW5yYWVmZ2Njb3dkd3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjAyNzQsImV4cCI6MjA4ODE5NjI3NH0.QwfoDxbMDXPrCmfGPLsKVzhfLpQBKBVmNwbNm_dIX1E"
);

interface Profile {
  id:         string;
  name:       string;
  email:      string;
  role:       string;
  avatar_url: string | null;
  created_at: string;
}

// ─── AVATAR ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-teal-600", "bg-blue-600", "bg-violet-600",
  "bg-amber-600", "bg-rose-600", "bg-emerald-600",
];

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

// ─── CARD GUÍA ────────────────────────────────────────────────────────────────
function GuideCard({ guide, index, isAdmin, onDelete }: {
  guide:    Profile;
  index:    number;
  isAdmin:  boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="relative bg-base-100 border border-base-content/10 rounded-2xl p-5 flex items-center gap-4 hover:shadow-sm transition-shadow">

      {/* Botón eliminar — solo admin, arriba derecha */}
      {isAdmin && (
        <button
          onClick={() => {
            if (confirm(`¿Eliminar a ${guide.name}? Esta acción no se puede deshacer.`)) {
              onDelete(guide.id);
            }
          }}
          className="absolute top-3 right-3 btn btn-ghost btn-circle btn-xs text-base-content/20 hover:text-error hover:bg-error/10 transition-colors"
          title="Eliminar guía"
        >
          <Trash2 size={13} />
        </button>
      )}

      {/* Avatar */}
      {guide.avatar_url ? (
        <img
          src={guide.avatar_url}
          alt={guide.name}
          className="w-12 h-12 rounded-full object-cover shrink-0 border-2 border-base-content/10"
        />
      ) : (
        <div className={[
          "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0",
          avatarColor(index),
        ].join(" ")}>
          {getInitials(guide.name)}
        </div>
      )}

      {/* Info */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-base-content truncate">{guide.name}</span>
          {guide.role === "admin" && (
            <span className="text-[9px] font-bold uppercase tracking-widest bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">
              Admin
            </span>
          )}
        </div>
        <span className="text-xs opacity-40 truncate mt-0.5">{guide.email}</span>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function GuidesView() {
  const { isAdmin } = useAuth();
  const [guides,  setGuides]  = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true });
      setGuides((data as Profile[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const handleDelete = async (id: string) => {
    // Eliminar de la lista optimistamente
    setGuides((prev) => prev.filter((g) => g.id !== id));
    // Eliminar de Supabase Auth (requiere service role — por ahora solo BD)
    await supabase.from("profiles").delete().eq("id", id);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 opacity-30">
      <span className="loading loading-spinner loading-sm" />
      <span className="text-sm">Cargando guías...</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-base-content tracking-tight">Guías</h1>
        <p className="text-xs opacity-40 mt-0.5">
          {guides.length} guía{guides.length !== 1 ? "s" : ""} registrada{guides.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Grid de cards */}
      {guides.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 opacity-20">
          <span className="text-4xl">👤</span>
          <span className="text-sm">Sin guías registradas</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {guides.map((guide, i) => (
            <GuideCard
              key={guide.id}
              guide={guide}
              index={i}
              isAdmin={isAdmin}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
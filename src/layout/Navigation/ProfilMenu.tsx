import { useState, useRef, useEffect } from "react";
import { Pencil, KeyRound, LogOut, Camera, X, Sun, Moon, Monitor } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "../../login/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import ReactDOM from "react-dom";

const supabase = createClient(
  "https://hccxpmnraefgccowdwri.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY3hwbW5yYWVmZ2Njb3dkd3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjAyNzQsImV4cCI6MjA4ODE5NjI3NH0.QwfoDxbMDXPrCmfGPLsKVzhfLpQBKBVmNwbNm_dIX1E"
);

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, children }: {
  open: boolean; onClose: () => void; children: React.ReactNode;
}) {
  return ReactDOM.createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm"
          style={{ zIndex: 99999 }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="bg-base-100 w-full sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 25 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

interface Props {
  side?:           "left" | "right";
  mobileDropDown?: "up" | "down";
}

export default function ProfileMenu({ side = "right", mobileDropDown = "up" }: Props) {
  const { profile, signOut } = useAuth();

  const [open,          setOpen]          = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [currentTheme,  setCurrentTheme]  = useState<"light" | "dark" | "system">("system");

  const [name,       setName]       = useState(profile?.name ?? "");
  const [avatarUrl,  setAvatarUrl]  = useState(profile?.avatar_url ?? "");
  const [uploading,  setUploading]  = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [newPass,     setNewPass]     = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passError,   setPassError]   = useState<string | null>(null);
  const [passSaving,  setPassSaving]  = useState(false);

  // Créditos
  const [guruCredits, setGuruCredits] = useState(0);
  const [freeCredits, setFreeCredits] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ref          = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setAvatarUrl(profile.avatar_url ?? "");
      // Cargar créditos
      supabase.from("guide_credits").select("platform, credits").eq("guide_id", profile.id)
        .then(({ data }) => {
          for (const row of data ?? []) {
            if (row.platform === "guruwalk") setGuruCredits(row.credits);
            if (row.platform === "freetour") setFreeCredits(row.credits);
          }
        });
    }
  }, [profile]);

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    if (saved) setCurrentTheme(saved);
    else setCurrentTheme("system");
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // No cerrar si el click es en un portal (modal o bottom sheet)
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      // Si hay un portal abierto en el body, no cerrar
      const portalEl = document.getElementById("profile-sheet");
      if (portalEl && portalEl.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = profile?.name
    ? profile.name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
    : "?";

  const changeTheme = (theme: "light" | "dark" | "system") => {
    setCurrentTheme(theme);
    if (theme === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
      localStorage.removeItem("theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("theme", theme);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploading(true);
    try {
      const ext  = file.name.split(".").pop();
      const path = `${profile.id}/avatar.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", profile.id);
      setAvatarUrl(data.publicUrl);
    } catch (err) { console.error(err); }
    setUploading(false);
  };

  const handleSaveName = async () => {
    if (!profile || !name.trim()) return;
    setSavingName(true);
    await supabase.from("profiles").update({ name: name.trim() }).eq("id", profile.id);
    setSavingName(false);
    setShowEditModal(false);
  };

  const handleChangePassword = async () => {
    setPassError(null);
    if (!newPass || !confirmPass) { setPassError("Rellena todos los campos."); return; }
    if (newPass !== confirmPass)  { setPassError("Las contraseñas no coinciden."); return; }
    if (newPass.length < 6)      { setPassError("Mínimo 6 caracteres."); return; }
    setPassSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setPassSaving(false);
    if (error) { setPassError(error.message); return; }
    setNewPass(""); setConfirmPass("");
    setShowPassModal(false);
  };

  // ─── CONTENIDO DEL MENÚ (compartido desktop/móvil) ───────────────────────
  const MenuContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Cabecera con avatar, nombre y email */}
      <div className={`px-4 py-4 ${isMobile ? "flex items-center gap-3" : "border-b border-base-content/5"}`}>
        <div className="w-12 h-12 rounded-full bg-primary/15 border-2 border-primary/30 overflow-hidden flex items-center justify-center text-primary font-bold shrink-0">
          {avatarUrl
            ? <img src={avatarUrl} className="w-full h-full object-cover" alt="avatar" />
            : initials
          }
        </div>
        <div className="flex flex-col min-w-0">
          <p className="text-sm font-bold leading-none truncate">{profile?.name ?? "Usuario"}</p>
          <p className="text-[11px] opacity-40 mt-0.5 truncate">{profile?.email}</p>
          {profile?.role === "admin" && (
            <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded-full w-fit">
              Admin
            </span>
          )}
        </div>
      </div>

      {/* Créditos — solo en móvil */}
      {isMobile && (
        <div className="mx-4 mb-3 p-3 bg-base-200/60 rounded-2xl border border-base-content/5">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">Créditos disponibles</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col">
              <span className="text-[10px] opacity-50">GuruWalk</span>
              <span className="text-lg font-black leading-tight">{guruCredits}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] opacity-50">FreeTour</span>
              <span className="text-lg font-black leading-tight">{freeCredits}</span>
            </div>
          </div>
        </div>
      )}

      {/* Selector de tema — solo en móvil */}
      {isMobile && (
        <div className="mx-4 mb-3 p-3 bg-base-200/60 rounded-2xl border border-base-content/5">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">Tema</p>
          <div className="flex gap-2">
            {([
              { theme: "light",  icon: Sun,     label: "Claro"  },
              { theme: "dark",   icon: Moon,    label: "Oscuro" },
              { theme: "system", icon: Monitor, label: "Auto"   },
            ] as const).map(({ theme, icon: Icon, label }) => (
              <button
                key={theme}
                onClick={() => changeTheme(theme)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                  currentTheme === theme
                    ? "bg-base-content text-base-100"
                    : "bg-base-100 opacity-50 hover:opacity-80"
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Items */}
      <div className={`py-1.5 ${isMobile ? "border-t border-base-content/5" : ""}`}>
        <button
          onClick={() => { setShowEditModal(true); setOpen(false); }}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-base-content/70 hover:bg-base-content/5 hover:text-base-content transition-colors"
        >
          <Pencil size={15} className="shrink-0" />
          Editar perfil
        </button>
        <button
          onClick={() => { setShowPassModal(true); setOpen(false); }}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-base-content/70 hover:bg-base-content/5 hover:text-base-content transition-colors"
        >
          <KeyRound size={15} className="shrink-0" />
          Cambiar contraseña
        </button>
      </div>

      {/* Cerrar sesión */}
      <div className="border-t border-base-content/5 py-1.5">
        <button
          onClick={() => { signOut(); setOpen(false); }}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-base-content/70 hover:bg-base-content/5 hover:text-base-content transition-colors"
        >
          <LogOut size={15} className="shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <div ref={ref} className="relative">

      {/* Botón avatar */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
      >
        <div className="w-9 h-9 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center overflow-hidden text-primary font-bold text-sm shrink-0">
          {avatarUrl
            ? <img src={avatarUrl} className="w-full h-full object-cover" alt="avatar" />
            : initials
          }
        </div>
        <div className="hidden lg:flex flex-col items-start">
          <span className="text-xs font-semibold text-base-content leading-none">{profile?.name ?? "Usuario"}</span>
          <span className="text-[10px] opacity-40 mt-0.5">{profile?.email}</span>
        </div>
      </button>

      {/* DESKTOP — dropdown normal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            className={[
              "hidden lg:flex lg:flex-col absolute w-56 bg-base-100 border border-base-content/10 rounded-2xl shadow-xl overflow-hidden",
              mobileDropDown === "up" ? "bottom-14 lg:bottom-auto lg:top-12" : "top-12",
              side === "right" ? "right-0" : "left-0",
            ].join(" ")}
            style={{ zIndex: 9999 }}
          >
            <MenuContent isMobile={false} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* MÓVIL — bottom sheet via portal */}
      {open && ReactDOM.createPortal(
        <div id="profile-sheet" className="lg:hidden" style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 25 }}
            style={{
              position: "relative", background: "var(--b1, #fff)",
              borderTopLeftRadius: "1.5rem", borderTopRightRadius: "1.5rem",
              boxShadow: "0 -10px 40px rgba(0,0,0,0.2)",
              paddingBottom: "env(safe-area-inset-bottom, 16px)",
              maxHeight: "85vh", overflowY: "auto",
            }}
          >
            {/* Handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
              <div style={{ width: 48, height: 6, borderRadius: 9999, background: "rgba(128,128,128,0.3)" }} />
            </div>
            <MenuContent isMobile={true} />
          </motion.div>
        </div>,
        document.body
      )}

      {/* Modal Editar perfil */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)}>
        <button onClick={() => setShowEditModal(false)} className="absolute top-6 right-6 opacity-30 hover:opacity-100"><X size={20} /></button>
        <h3 className="text-xl font-bold mb-6 text-center">Mi Perfil</h3>
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-primary/10 border-4 border-base-100 shadow-xl overflow-hidden flex items-center justify-center text-primary text-2xl font-bold">
              {uploading ? <span className="loading loading-spinner loading-md" />
                : avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" alt="avatar" />
                : initials}
            </div>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="absolute bottom-0 right-0 p-2.5 bg-primary text-white rounded-full shadow-lg border-4 border-base-100 active:scale-90 transition-transform disabled:opacity-40">
              <Camera size={16} />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 mb-5">
          <label className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Nombre</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="input w-full rounded-2xl bg-base-200 border-none focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <button onClick={handleSaveName} disabled={savingName}
          className="btn bg-base-content text-base-100 hover:bg-base-content/85 border-none w-full rounded-2xl disabled:opacity-40">
          {savingName ? <span className="loading loading-spinner loading-sm" /> : "Guardar cambios"}
        </button>
      </Modal>

      {/* Modal Cambiar contraseña */}
      <Modal open={showPassModal} onClose={() => setShowPassModal(false)}>
        <button onClick={() => setShowPassModal(false)} className="absolute top-6 right-6 opacity-30 hover:opacity-100"><X size={20} /></button>
        <h3 className="text-xl font-bold mb-2 text-center">Seguridad</h3>
        <p className="text-xs opacity-50 text-center mb-6">Actualiza tu contraseña de acceso</p>
        <div className="flex flex-col gap-3">
          <input type="password" placeholder="Nueva contraseña" value={newPass} onChange={(e) => setNewPass(e.target.value)}
            className="input w-full rounded-2xl bg-base-200 border-none focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <input type="password" placeholder="Confirmar contraseña" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)}
            className="input w-full rounded-2xl bg-base-200 border-none focus:outline-none focus:ring-2 focus:ring-primary/20" />
          {passError && (
            <div className="bg-error/10 border border-error/20 text-error text-xs rounded-xl px-3 py-2">{passError}</div>
          )}
          <button onClick={handleChangePassword} disabled={passSaving}
            className="btn bg-base-content text-base-100 hover:bg-base-content/85 border-none w-full rounded-2xl mt-2 disabled:opacity-40">
            {passSaving ? <span className="loading loading-spinner loading-sm" /> : "Actualizar contraseña"}
          </button>
        </div>
      </Modal>

    </div>
  );
}

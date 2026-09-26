import { useState } from "react";
import { useAuth } from "./AuthContext";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User as UserIcon,
  ShieldCheck,
  ArrowRight,
  HelpCircle,
  CheckCircle2,
} from "lucide-react";

type Mode = "login" | "signup";

export default function LoginPage() {
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>("login");

  // ── Login ──
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // ── Crear cuenta ──
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [showSignupPass, setShowSignupPass] = useState(false);
  const [signupSuccessMessage, setSignupSuccessMessage] = useState<
    string | null
  >(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSignupSuccessMessage(null);
  }

  const handleSubmit = async () => {
    if (!email || !password) {
      setError("Introduce email y contraseña.");
      return;
    }
    setLoading(true);
    setError(null);
    const err = await signIn(email, password);
    if (err) setError(err);
    setLoading(false);
  };

  const handleSignUp = async () => {
    setError(null);
    setSignupSuccessMessage(null);

    if (
      !signupName.trim() ||
      !signupEmail ||
      !signupPassword ||
      !signupConfirm
    ) {
      setError("Rellena todos los campos.");
      return;
    }
    if (signupPassword !== signupConfirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (signupPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setLoading(true);
    const { error: signUpError, needsEmailConfirmation } = await signUp(
      signupEmail,
      signupPassword,
      signupName.trim(),
    );
    setLoading(false);

    if (signUpError) {
      setError(signUpError);
      return;
    }

    if (needsEmailConfirmation) {
      // No hay sesión todavía — hay que esperar a que confirme el email.
      setSignupSuccessMessage(
        "Cuenta creada. Revisa tu correo y confirma tu cuenta para poder entrar.",
      );
      setSignupName("");
      setSignupEmail("");
      setSignupPassword("");
      setSignupConfirm("");
    }
    // Si NO hace falta confirmar email, Supabase ya deja la sesión activa y
    // el propio AuthProvider (onAuthStateChange) lleva a la persona dentro
    // de la app sola, sin que haga falta redirigir nada aquí.
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-main)] font-sans text-[var(--text-main)]">
      {/* ── HEADER CON COLOR VERDE OSCURO ── */}
      <header className="bg-[var(--header-bg)] text-white px-6 py-4 flex items-center justify-between shadow-md border-b border-white/10 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-400/20 border border-amber-300/40 flex items-center justify-center font-serif text-amber-300 font-bold text-xs">
            VX
          </div>
          <span className="font-serif tracking-widest text-lg text-amber-200/90 font-medium">
            VIVALUX
          </span>
          <span className="text-white/30 text-sm font-light">|</span>
          <span className="text-xs uppercase tracking-wider text-white/70 font-sans">
            Tour Manager
          </span>
        </div>

        <button className="flex items-center gap-2 text-xs text-white/80 hover:text-white transition-colors">
          <span>¿Necesitas ayuda?</span>
          <HelpCircle size={16} />
        </button>
      </header>

      {/* ── CONTENIDO PRINCIPAL (SPLIT SCREEN) ── */}
      <main className="flex-1 flex flex-col lg:flex-row">
        {/* COLUMNA IZQUIERDA: FOTO OFICIAL CON OVERLAY */}
        <div className="lg:w-1/2 relative min-h-[420px] lg:min-h-full flex flex-col justify-between p-8 lg:p-12 overflow-hidden text-white">
          <img
            src="https://images.unsplash.com/photo-1513581166391-887a96ddeafd?q=80&w=1600&auto=format&fit=crop"
            alt="Vivalux Tour Manager"
            className="absolute inset-0 w-full h-full object-cover"
          />

          <div className="absolute inset-0 bg-gradient-to-tr from-[#032018]/90 via-[#062e24]/75 to-black/30" />

          <div className="relative z-10">
            <span className="text-amber-200/90 text-xs tracking-[0.25em] font-semibold uppercase block mb-1">
              Vivalux
            </span>
            <span className="text-white/60 text-[10px] tracking-[0.2em] uppercase font-mono block">
              Tour Manager
            </span>
          </div>

          <div className="relative z-10 my-auto py-8">
            <h1 className="font-serif text-3xl lg:text-5xl font-light leading-tight mb-4 text-amber-50/95 italic">
              Tu ruta, <br />
              tu equipo, <br />
              <span className="font-normal not-italic text-white">
                en un solo lugar.
              </span>
            </h1>

            <p className="text-sm text-white/80 max-w-md font-light leading-relaxed mb-8">
              Accede a la plataforma de gestión de tours de Vivalux y ten toda
              la información de tus grupos, itinerarios y experiencias, siempre
              contigo.
            </p>

            <div className="space-y-4 max-w-md border-t border-white/10 pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-white/10 rounded-lg text-amber-200">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">
                    Gestiona tus tours
                  </h3>
                  <p className="text-[11px] text-white/60">
                    Itinerarios, horarios y participantes.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-2 bg-white/10 rounded-lg text-amber-200">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">
                    Accede a tu grupo
                  </h3>
                  <p className="text-[11px] text-white/60">
                    Detalles, notas y cambios en tiempo real.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-2 bg-white/10 rounded-lg text-amber-200">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M12 18l9-5-9-5-9 5 9 5z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">
                    Todo en tu bolsillo
                  </h3>
                  <p className="text-[11px] text-white/60">
                    Desde cualquier dispositivo.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 text-[11px] text-white/50 italic font-serif">
            Juntos creamos experiencias inolvidables
          </div>
        </div>

        {/* COLUMNA DERECHA: FORMULARIO */}
        <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md bg-white rounded-3xl p-8 lg:p-10 shadow-xl border border-black/5">
            {/* Logo Central del Formulario */}
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-[var(--primary)] text-amber-200 flex items-center justify-center mx-auto mb-2 font-serif text-base font-bold shadow-sm">
                VX
              </div>
              <h2 className="font-serif text-xl tracking-widest uppercase text-[var(--primary)] font-semibold">
                VIVALUX
              </h2>
              <p className="text-[9px] uppercase tracking-[0.25em] text-gray-400 font-sans">
                Tour Manager
              </p>
            </div>

            {/* Selector de pestañas — ya interactivo */}
            <div className="flex border-b border-gray-100 mb-6 text-xs">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={[
                  "flex-1 py-2 font-semibold text-center transition-colors",
                  mode === "login"
                    ? "text-[var(--primary)] border-b-2 border-[var(--primary)]"
                    : "text-gray-400 hover:text-gray-600",
                ].join(" ")}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={[
                  "flex-1 py-2 font-semibold text-center transition-colors",
                  mode === "signup"
                    ? "text-[var(--primary)] border-b-2 border-[var(--primary)]"
                    : "text-gray-400 hover:text-gray-600",
                ].join(" ")}
              >
                Crear cuenta
              </button>
            </div>

            {mode === "login" ? (
              <>
                <div className="mb-6">
                  <h3 className="font-serif italic text-2xl text-gray-800 font-normal">
                    Bienvenido de nuevo
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Inicia sesión en tu cuenta de Tour Manager de Vivalux.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="relative flex items-center">
                      <Mail
                        className="absolute left-3 text-gray-400"
                        size={16}
                      />
                      <input
                        type="email"
                        placeholder="Correo electrónico"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                        className="w-full bg-[var(--bg-card)] text-gray-800 placeholder-gray-400 text-xs py-3 pl-10 pr-4 rounded-xl border border-transparent focus:border-[var(--primary)] focus:bg-white focus:outline-none transition-all"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="relative flex items-center">
                      <Lock
                        className="absolute left-3 text-gray-400"
                        size={16}
                      />
                      <input
                        type={showPass ? "text" : "password"}
                        placeholder="Contraseña"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                        className="w-full bg-[var(--bg-card)] text-gray-800 placeholder-gray-400 text-xs py-3 pl-10 pr-10 rounded-xl border border-transparent focus:border-[var(--primary)] focus:bg-white focus:outline-none transition-all"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-3 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <label className="flex items-center gap-2 text-gray-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="checkbox checkbox-xs rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                      />
                      <span>Recordarme</span>
                    </label>
                    <a
                      href="#forgot"
                      className="text-[var(--primary)] hover:underline font-medium"
                    >
                      ¿Olvidaste tu contraseña?
                    </a>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-3 mt-4">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="mt-6 w-full py-3 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-medium rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <>
                      <span>Iniciar sesión</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <div className="mb-6">
                  <h3 className="font-serif italic text-2xl text-gray-800 font-normal">
                    Únete al equipo
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Crea tu cuenta de guía de Tour Manager de Vivalux.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="relative flex items-center">
                      <UserIcon
                        className="absolute left-3 text-gray-400"
                        size={16}
                      />
                      <input
                        type="text"
                        placeholder="Nombre completo"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        className="w-full bg-[var(--bg-card)] text-gray-800 placeholder-gray-400 text-xs py-3 pl-10 pr-4 rounded-xl border border-transparent focus:border-[var(--primary)] focus:bg-white focus:outline-none transition-all"
                        autoComplete="name"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="relative flex items-center">
                      <Mail
                        className="absolute left-3 text-gray-400"
                        size={16}
                      />
                      <input
                        type="email"
                        placeholder="Correo electrónico"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="w-full bg-[var(--bg-card)] text-gray-800 placeholder-gray-400 text-xs py-3 pl-10 pr-4 rounded-xl border border-transparent focus:border-[var(--primary)] focus:bg-white focus:outline-none transition-all"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="relative flex items-center">
                      <Lock
                        className="absolute left-3 text-gray-400"
                        size={16}
                      />
                      <input
                        type={showSignupPass ? "text" : "password"}
                        placeholder="Contraseña"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="w-full bg-[var(--bg-card)] text-gray-800 placeholder-gray-400 text-xs py-3 pl-10 pr-10 rounded-xl border border-transparent focus:border-[var(--primary)] focus:bg-white focus:outline-none transition-all"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPass(!showSignupPass)}
                        className="absolute right-3 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {showSignupPass ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="relative flex items-center">
                      <Lock
                        className="absolute left-3 text-gray-400"
                        size={16}
                      />
                      <input
                        type={showSignupPass ? "text" : "password"}
                        placeholder="Confirmar contraseña"
                        value={signupConfirm}
                        onChange={(e) => setSignupConfirm(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSignUp()}
                        className="w-full bg-[var(--bg-card)] text-gray-800 placeholder-gray-400 text-xs py-3 pl-10 pr-4 rounded-xl border border-transparent focus:border-[var(--primary)] focus:bg-white focus:outline-none transition-all"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-3 mt-4">
                    {error}
                  </div>
                )}

                {signupSuccessMessage && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl p-3 mt-4 flex items-start gap-2">
                    <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                    <span>{signupSuccessMessage}</span>
                  </div>
                )}

                <button
                  onClick={handleSignUp}
                  disabled={loading}
                  className="mt-6 w-full py-3 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-medium rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <>
                      <span>Crear cuenta</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </>
            )}

            {/* Divisor */}
            <div className="relative my-6 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100" />
              </div>
              <span className="relative bg-white px-3 text-[10px] uppercase text-gray-400 font-mono">
                o
              </span>
            </div>

            {/* Botón de Google — se queda tal cual, sin conectar todavía */}
            <button
              type="button"
              className="w-full py-2.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continuar con Google</span>
            </button>

            {/* Aviso de Guías Autorizados */}
            <div className="mt-6 p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl flex items-start gap-3">
              <ShieldCheck
                className="text-emerald-700 shrink-0 mt-0.5"
                size={16}
              />
              <div>
                <h4 className="text-[11px] font-semibold text-emerald-900">
                  Solo para guías autorizados
                </h4>
                <p className="text-[10px] text-emerald-700/80 leading-relaxed">
                  Esta plataforma está diseñada exclusivamente para el equipo de
                  guías de Vivalux.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── FOOTER CON COLOR VERDE OSCURO ── */}
      <footer className="bg-[var(--header-bg)] text-white/70 px-6 py-4 flex flex-col md:flex-row items-center justify-between border-t border-white/10 gap-4 text-xs z-10">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-amber-400/20 border border-amber-300/40 flex items-center justify-center font-serif text-amber-300 font-bold text-[10px]">
            VX
          </div>
          <span className="font-serif tracking-widest text-white text-xs">
            VIVALUX
          </span>
          <span className="text-white/30">|</span>
          <span className="text-white/60">Tour Manager</span>
        </div>

        <p className="text-[11px] text-white/50 italic font-serif">
          Belgium, beautifully experienced.
        </p>

        <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-white/60">
          <span>EXPERIENCIAS</span>
          <span>·</span>
          <span>PERSONAS</span>
          <span>·</span>
          <span>DESTINOS</span>
        </div>
      </footer>
    </div>
  );
}

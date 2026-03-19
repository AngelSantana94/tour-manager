import { useState } from "react";
import { useAuth } from "./AuthContext";
import { Eye, EyeOff, LogIn } from "lucide-react";

export default function LoginPage() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    // bg-base-200 se adapta solo al tema
    <div className="min-h-screen bg-base-200 flex items-center justify-center px-4 transition-colors duration-300">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tight text-base-content">
            <span className="text-primary">Tour</span>Manager
          </h1>
          <p className="text-[10px] opacity-50 font-bold uppercase tracking-[0.2em] mt-1">
            Brujas Edition
          </p>
        </div>

        {/* Card */}
        {/* Usamos border-base-content/5 para que el borde sea sutil en ambos modos */}
        <div className="bg-base-200 rounded-[2rem] border border-base-content/5 shadow-2xl p-8 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-bold text-base-content">
              Iniciar sesión
            </h2>
            <p className="text-xs text-base-content/50 mt-1">
              Accede a tu panel de gestión
            </p>
          </div>

          <div className="space-y-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold opacity-40 uppercase ml-1 tracking-wider">
                Email
              </label>
              <input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="input bg-base-100 border-none focus:ring-2 ring-primary/20 w-full text-sm rounded-xl"
                autoComplete="email"
              />
            </div>

            {/* Contraseña */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold opacity-40 uppercase ml-1 tracking-wider">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  className="input bg-base-100 border-none focus:ring-2 ring-primary/20 w-full text-sm pr-10 rounded-xl"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/20 hover:text-primary transition-colors"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-error/10 border border-error/20 text-error text-[11px] font-medium rounded-xl px-4 py-3 animate-shake">
              {error}
            </div>
          )}

          {/* Botón - AQUÍ ESTÁ LA MAGIA */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn btn-primary w-full rounded-xl text-white shadow-lg shadow-primary/20 border-none disabled:bg-base-300 disabled:text-base-content/20"
          >
            {loading ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <>
                <LogIn size={18} /> Entrar
              </>
            )}
          </button>
        </div>

        <p className="text-center text-[10px] opacity-20 mt-8 font-mono uppercase tracking-widest">
          v1.0.0 · tourmanager-ia
        </p>
      </div>
    </div>
  );
}

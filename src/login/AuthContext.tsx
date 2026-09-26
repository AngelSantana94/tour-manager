import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { User, Session } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: "admin" | "guide";
  avatar_url: string | null;
  created_at: string;
}

// Los 3 idiomas de la webapp. Se guarda en el metadata del usuario al
// registrarse, y el Send Email Hook (edge function) lo lee para elegir la
// plantilla del correo de confirmación. Si el registro es previo a esto, o
// no llegó por alguna razón, el hook usa "es" por defecto.
export type AppLanguage = "es" | "nl" | "en";

export interface SignUpResult {
  error: string | null;
  needsEmailConfirmation: boolean;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    language: AppLanguage,
  ) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error cargando perfil:", error.message);
    }
    setProfile((data as Profile) ?? null);
  }

  useEffect(() => {
    // onAuthStateChange gestiona la carga inicial (INITIAL_SESSION) y los cambios de estado.
    // IMPORTANTE: el callback debe ser SÍNCRONO. Si hacemos await de otra llamada a Supabase
    // aquí dentro, se puede quedar bloqueado esperando el lock interno de auth
    // (el mismo "lock:sb-...-auth-token"), dejando loading en true para siempre.
    // Por eso cualquier llamada adicional se difiere con setTimeout(..., 0).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        setTimeout(() => {
          loadProfile(currentUser.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (
    email: string,
    password: string,
  ): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return error.message;
    return null;
  };

  // El nombre y el idioma viajan como metadata (options.data). El nombre lo
  // lee el trigger de la BD (link_or_create_guide_on_signup); el idioma lo
  // lee el Send Email Hook (edge function auth-send-email) para elegir la
  // plantilla del correo de confirmación. Ninguno de los dos tiene relación
  // con columnas de tabla, son metadata libre de Supabase Auth.
  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    language: AppLanguage,
  ): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, preferred_language: language } },
    });
    if (error) return { error: error.message, needsEmailConfirmation: false };
    // Si el proyecto exige confirmar el email, signUp no devuelve sesión
    // todavía — hay que avisar al guía de que revise su correo.
    return { error: null, needsEmailConfirmation: !data.session };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        isAdmin: profile?.role === "admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
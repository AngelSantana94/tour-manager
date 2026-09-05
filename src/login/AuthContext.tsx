import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClientOTA";
import type { User, Session } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: "admin" | "guide";
  avatar_url: string | null;
  created_at: string;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
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

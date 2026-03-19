import { useAuth } from "./AuthContext";
import LoginPage from "./LoginPage";

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 opacity-40">
          <span className="loading loading-spinner loading-md" />
          <span className="text-xs font-medium uppercase tracking-widest">Cargando...</span>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return <>{children}</>;
}
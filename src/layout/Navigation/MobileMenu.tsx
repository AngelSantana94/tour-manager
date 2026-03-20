import { useState } from "react";
import { BarChart3, User, Calendar, MessageSquare,
  Wallet } from "lucide-react";
import type { ActiveView } from "../DashboardLayout";

type MobileTab = ActiveView | "avisos" | "perfil";

interface Props {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
}

function MobileMenu({ activeView, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<MobileTab>(activeView);

  const handleTab = (tab: MobileTab, view?: ActiveView) => {
    setActiveTab(tab);
    if (view) onNavigate(view);
  };

  const isActive = (tab: MobileTab) => activeTab === tab;

  return (
    <div className="fixed bottom-0 left-0 z-50 w-full h-16 bg-base-100 border-t border-base-content/5 flex items-center px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
      {/* Métricas */}
      <button
        onClick={() => handleTab("metricas", "metricas")}
        className="flex flex-col items-center justify-center gap-1 flex-1 h-full active:scale-90 transition-transform"
      >
        <div
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${isActive("metricas") ? "bg-primary/10" : ""}`}
        >
          <BarChart3
            size={22}
            strokeWidth={isActive("metricas") ? 2.5 : 1.8}
            className={
              isActive("metricas")
                ? "text-primary"
                : "text-base-content opacity-40"
            }
          />
          <span
            className={`text-[10px] font-medium ${isActive("metricas") ? "text-primary" : "text-base-content opacity-40"}`}
          >
            Métricas
          </span>
        </div>
      </button>

      {/* Guias */}
      <button
        onClick={() => handleTab("guias", "guias")}
        className="flex flex-col items-center justify-center gap-1 flex-1 h-full active:scale-90 transition-transform"
      >
        <div
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${isActive("metricas") ? "bg-primary/10" : ""}`}
        >
          <User
            size={22}
            strokeWidth={isActive("guias") ? 2.5 : 1.8}
            className={
              isActive("metricas")
                ? "text-primary"
                : "text-base-content opacity-40"
            }
          />
          <span
            className={`text-[10px] font-medium ${isActive("guias") ? "text-primary" : "text-base-content opacity-40"}`}
          >
            Guías
          </span>
        </div>
      </button>

      {/* Calendario */}
      <button
        onClick={() => handleTab("calendario", "calendario")}
        className="flex flex-col items-center justify-center gap-1 flex-1 h-full active:scale-90 transition-transform"
      >
        <div
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${isActive("calendario") ? "bg-primary/10" : ""}`}
        >
          <Calendar
            size={22}
            strokeWidth={isActive("calendario") ? 2.5 : 1.8}
            className={
              isActive("calendario")
                ? "text-primary"
                : "text-base-content opacity-40"
            }
          />
          <span
            className={`text-[10px] font-medium ${isActive("calendario") ? "text-primary" : "text-base-content opacity-40"}`}
          >
            Calendario
          </span>
        </div>
      </button>

      {/* Mensajes */}
      <button
        onClick={() => handleTab("mensajes", "mensajes")}
        className="flex flex-col items-center justify-center gap-1 flex-1 h-full active:scale-90 transition-transform"
      >
        <div
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${isActive("mensajes") ? "bg-primary/10" : ""}`}
        >
          <MessageSquare
            size={22}
            strokeWidth={isActive("mensajes") ? 2.5 : 1.8}
            className={
              isActive("mensajes")
                ? "text-primary"
                : "text-base-content opacity-40"
            }
          />
          <span
            className={`text-[10px] font-medium ${isActive("mensajes") ? "text-primary" : "text-base-content opacity-40"}`}
          >
            Mensajes
          </span>
        </div>
      </button>

      {/* Facturación */}
      <button
        onClick={() => handleTab("facturacion", "facturacion")}
        className="flex flex-col items-center justify-center gap-1 flex-1 h-full active:scale-90 transition-transform"
      >
        <div
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${isActive("facturacion") ? "bg-primary/10" : ""}`}
        >
          <Wallet
            size={22}
            strokeWidth={isActive("facturacion") ? 2.5 : 1.8}
            className={
              isActive("facturacion")
                ? "text-primary"
                : "text-base-content opacity-40"
            }
          />
          <span
            className={`text-[10px] font-medium ${isActive("facturacion") ? "text-primary" : "text-base-content opacity-40"}`}
          >
            Facturación
          </span>
        </div>
      </button>
    </div>
  );
}

export default MobileMenu;

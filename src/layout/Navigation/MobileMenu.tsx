import { useState } from "react";
import { Menu, BarChart3, Calendar, User } from "lucide-react";
import type { ActiveView } from "../DashboardLayout";
import NotificationsMobile from "../../Notifications/NotificationsMobile";
import ProfileMenu from "./ProfilMenu";

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
      {/* Menú — abre el drawer */}
      <label
        htmlFor="my-drawer-4"
        className="flex flex-col items-center justify-center gap-1 flex-1 h-full cursor-pointer active:scale-90 transition-transform"
      >
        <Menu
          size={22}
          strokeWidth={1.8}
          className="text-base-content opacity-40"
        />
        <span className="text-[10px] font-medium text-base-content opacity-40">
          Menú
        </span>
      </label>

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

      {/* Avisos — componente propio con modal y punto rojo */}
      <NotificationsMobile
        isActive={isActive("avisos")}
        onClick={() => setActiveTab("avisos")}
      />

      {/* Perfil */}
      <button
        onClick={() => handleTab("perfil")}
        className="flex flex-col items-center justify-center gap-1 flex-1 h-full active:scale-90 transition-transform"
      >
        <div
          className={`flex flex-col items-center gap-1 px-2 py-1 rounded-xl transition-colors ${isActive("perfil") ? "bg-primary/10" : ""}`}
        >
          <div
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isActive("perfil") ? "border-primary text-primary" : "border-base-content/20 text-base-content opacity-40"}`}
          >
            
            <ProfileMenu/>
          </div>
          <span
            className={`text-[10px] font-medium ${isActive("perfil") ? "text-primary" : "text-base-content opacity-40"}`}
          >
            Perfil
          </span>
        </div>
      </button>
    </div>
  );
}

export default MobileMenu;

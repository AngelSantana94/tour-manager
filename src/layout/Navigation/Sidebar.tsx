import { useEffect, useState } from "react";
import {
  BarChart3,
  Users,
  Calendar,
  SlidersHorizontal,
  Sun,
  Moon,
  Monitor,
  PanelLeftOpen,
  PanelLeftClose,
} from "lucide-react";
import type { ActiveView } from "../DashboardLayout";

interface Props {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
}

interface MenuItem {
  name: string;
  icon: React.ElementType;
  view: ActiveView;
}

const menuItems: MenuItem[] = [
  { name: "Métricas", view: "metricas", icon: BarChart3 },
  { name: "Guías", view: "guias", icon: Users },
  { name: "Calendario", view: "calendario", icon: Calendar },
  { name: "Disponibilidad", view: "disponibilidad", icon: SlidersHorizontal },
];

export default function Sidebar({ activeView, onNavigate }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark" | "system">(
    "system",
  );

  const changeTheme = (theme: "light" | "dark" | "system") => {
    setCurrentTheme(theme);
    if (theme === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute(
        "data-theme",
        isDark ? "dark" : "light",
      );
      localStorage.removeItem("theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("theme", theme);
    }
  };

  return (
    <aside
      className={`hidden lg:flex flex-col h-screen sticky top-0 bg-base-200 border-r border-base-content/10 transition-all duration-300 z-30 ${
        isOpen ? "w-54" : "w-16"
      }`}
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-3.5 border-b border-base-content/5 shrink-0">
        {isOpen && (
          <div className="flex flex-col overflow-hidden whitespace-nowrap">
            <h2 className="font-bold tracking-tight leading-none text-base">
              Suppliers
            </h2>
            <p className="text-[10px] opacity-50 font-medium tracking-wider mt-0.5">
              Panel de administración
            </p>
          </div>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-xl hover:bg-base-300 transition-colors"
          title={isOpen ? "Colapsar menú" : "Expandir menú"}
        >
          {isOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
        </button>
      </div>

      {/* Navegación */}
      <div
        className={`flex-1 px-2 py-3 flex flex-col justify-between ${
          isOpen ? "overflow-y-auto" : "overflow-visible"
        }`}
      >
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive = activeView === item.view;
            return (
              <li key={item.name}>
                <button
                  onClick={() => onNavigate(item.view)}
                  className={`w-full flex items-center gap-3 py-3 px-3 rounded-xl transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "hover:bg-base-300 opacity-80 hover:opacity-100"
                  } ${!isOpen ? "justify-center" : ""}`}
                >
                  <item.icon
                    size={22}
                    className="shrink-0"
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  {isOpen && (
                    <span className="text-sm whitespace-nowrap">
                      {item.name}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Tema y versión */}
        <div className="pt-4 border-t border-base-content/10 space-y-2">
          {isOpen && (
            <p className="text-[10px] font-bold uppercase opacity-40 px-2 tracking-widest">
              Tema
            </p>
          )}
          <div className="flex flex-col gap-1">
            <button
              onClick={() => changeTheme("light")}
              className={`w-full flex items-center gap-3 py-2 px-3 rounded-xl transition-all text-sm ${
                currentTheme === "light"
                  ? "bg-primary/20 text-primary font-semibold"
                  : "hover:bg-base-300 opacity-60 hover:opacity-100"
              } ${!isOpen ? "justify-center" : ""}`}
            >
              <Sun size={20} className="shrink-0" />
              {isOpen && <span>Claro</span>}
            </button>

            <button
              onClick={() => changeTheme("dark")}
              className={`w-full flex items-center gap-3 py-2 px-3 rounded-xl transition-all text-sm ${
                currentTheme === "dark"
                  ? "bg-primary/20 text-primary font-semibold"
                  : "hover:bg-base-300 opacity-60 hover:opacity-100"
              } ${!isOpen ? "justify-center" : ""}`}
            >
              <Moon size={20} className="shrink-0" />
              {isOpen && <span>Oscuro</span>}
            </button>

            <button
              onClick={() => changeTheme("system")}
              className={`w-full flex items-center gap-3 py-2 px-3 rounded-xl transition-all text-sm ${
                currentTheme === "system"
                  ? "bg-primary/20 text-primary font-semibold"
                  : "hover:bg-base-300 opacity-60 hover:opacity-100"
              } ${!isOpen ? "justify-center" : ""}`}
            >
              <Monitor size={20} className="shrink-0" />
              {isOpen && <span>Sistema</span>}
            </button>
          </div>

          {isOpen && (
            <div className="pt-2 text-[10px] opacity-30 text-center font-mono italic uppercase">
              v2.0.0 - tourmanager-IA
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

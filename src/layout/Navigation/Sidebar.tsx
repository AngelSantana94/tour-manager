import { useState } from "react";
import {
  BarChart3, Users, Calendar, MessageSquare,
  Wallet, Sun, Moon, Monitor, PanelLeftOpen, PanelLeftClose,
} from "lucide-react";
import type { ActiveView } from "../DashboardLayout";

interface Props {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
}

function Sidebar({ activeView, onNavigate }: Props) {
  const [isOpen,       setIsOpen]       = useState(true);
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark" | "system">("system");

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

  const menuItems = [
    { name: "Métricas",    view: "metricas"    as ActiveView, icon: BarChart3     },
    { name: "Guías",       view: "guias"       as ActiveView, icon: Users         },
    { name: "Calendario",  view: "calendario"  as ActiveView, icon: Calendar      },
    { name: "Mensajes",    view: "mensajes"    as ActiveView, icon: MessageSquare },
    { name: "Facturación", view: "facturacion" as ActiveView, icon: Wallet        },
  ];

  return (
    <div className="drawer-side is-drawer-close:overflow-visible">
      <label
        htmlFor="my-drawer-4"
        aria-label="close sidebar"
        className="drawer-overlay"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="hidden lg:flex sticky top-0 z-10 h-16 items-center justify-between px-4 shrink-0 bg-base-200 border-b border-base-content/5">
          <div className="is-drawer-close:hidden flex flex-col">
            <h2 className="font-bold tracking-tight leading-none">Suppliers</h2>
            <p className="text-[10px] opacity-50 font-medium tracking-wider">
              Panel de administración
            </p>
          </div>
          <div
            onClick={() => setIsOpen(!isOpen)}
            className="cursor-pointer hover:opacity-70 transition-opacity is-drawer-close:mx-auto"
          >
            {isOpen
              ? <PanelLeftOpen  size={20} className="flex items-center" />
              : <PanelLeftClose size={20} className="flex items-center" />
            }
          </div>
        </div>
      </label>

      <div className="flex min-h-full flex-col items-start bg-base-200 is-drawer-close:w-14 is-drawer-open:w-64">
        <ul className="menu w-full grow">

          {menuItems.map((item) => {
            const isActive = activeView === item.view;
            return (
              <li key={item.name}>
                <button
                  onClick={() => onNavigate(item.view)}
                  className={`flex items-center gap-4 py-4 px-2.5 rounded-xl transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary active"
                      : "hover:bg-base-300"
                  }`}
                >
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[15px] is-drawer-close:hidden">{item.name}</span>
                </button>
              </li>
            );
          })}

          <div className="mx-4 my-2 border-t border-base-content/10" />

          {/* Tema */}
          <div className="mt-auto">
            <p className="text-[10px] font-bold uppercase opacity-40 mb-3 tracking-widest is-drawer-close:hidden">
              Tema
            </p>
            <div className="grid grid-cols-1 gap-1">
              <button
                onClick={() => changeTheme("light")}
                className={`flex items-center gap-4 py-2.5 px-4 rounded-xl transition-all ${
                  currentTheme === "light"
                    ? "bg-primary/20 text-primary font-semibold"
                    : "hover:bg-base-300 opacity-60"
                }`}
              >
                <Sun size={20} />
                <span className="text-sm is-drawer-close:hidden">Claro</span>
              </button>

              <button
                onClick={() => changeTheme("dark")}
                className={`flex items-center gap-4 py-2.5 px-4 rounded-xl transition-all ${
                  currentTheme === "dark"
                    ? "bg-primary/20 text-primary font-semibold"
                    : "hover:bg-base-300 opacity-60"
                }`}
              >
                <Moon size={20} />
                <span className="text-sm is-drawer-close:hidden">Oscuro</span>
              </button>

              <button
                onClick={() => changeTheme("system")}
                className={`flex items-center gap-4 py-2.5 px-4 rounded-xl transition-all ${
                  currentTheme === "system"
                    ? "bg-primary/20 text-primary font-semibold"
                    : "hover:bg-base-300 opacity-60"
                }`}
              >
                <Monitor size={20} />
                <span className="text-sm is-drawer-close:hidden">Sistema</span>
              </button>
            </div>

            <div className="mx-4 my-2 border-t border-base-content/10" />

            <div className="mt-6 pt-4 border-t border-secondary/5 text-[10px] opacity-30 text-center font-mono italic uppercase is-drawer-close:hidden">
              v1.0.0 - tourmanager-IA
            </div>
          </div>
        </ul>
      </div>
    </div>
  );
}

export default Sidebar;
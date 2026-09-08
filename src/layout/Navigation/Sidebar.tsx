import { useEffect, useState } from "react";
import {
  BarChart3,
  Users,
  Calendar,
  SlidersHorizontal,
  Wallet,
  Receipt,
  Ticket,
  ChevronDown,
  X,
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

interface SubItem {
  name: string;
  view: ActiveView;
  icon: React.ElementType;
}

interface MenuItem {
  name: string;
  icon: React.ElementType;
  view?: ActiveView;
  children?: SubItem[];
}

const menuItems: MenuItem[] = [
  { name: "Métricas", view: "metricas", icon: BarChart3 },
  { name: "Guías", view: "guias", icon: Users },
  { name: "Calendario", view: "calendario", icon: Calendar },
  { name: "Disponibilidad", view: "disponibilidad", icon: SlidersHorizontal },
  {
    name: "Facturación",
    icon: Wallet,
    children: [
      { name: "Facturación", view: "facturacion", icon: Receipt },
      { name: "Voucher", view: "voucher", icon: Ticket },
    ],
  },
];

function Sidebar({ activeView, onNavigate }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark" | "system">(
    "system",
  );

  // Acordeón del grupo Facturación (solo tiene sentido con la sidebar abierta)
  const [facturacionExpanded, setFacturacionExpanded] = useState(
    activeView === "facturacion" || activeView === "voucher",
  );
  // Si navegan a uno de los hijos por cualquier otra vía, que el acordeón
  // se despliegue solo para reflejarlo.
  useEffect(() => {
    if (activeView === "facturacion" || activeView === "voucher") {
      setFacturacionExpanded(true);
    }
  }, [activeView]);

  // Modal de elección cuando la sidebar está colapsada y no hay sitio
  // para desplegar el acordeón inline.
  const [groupModal, setGroupModal] = useState<MenuItem | null>(null);

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

  const handleGroupClick = (item: MenuItem) => {
    if (!isOpen) {
      setGroupModal(item);
    } else {
      setFacturacionExpanded((prev) => !prev);
    }
  };

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
            {isOpen ? (
              <PanelLeftOpen size={20} className="flex items-center" />
            ) : (
              <PanelLeftClose size={20} className="flex items-center" />
            )}
          </div>
        </div>
      </label>

      <div className="flex min-h-full flex-col items-start bg-base-200 is-drawer-close:w-14 is-drawer-open:w-64">
        <ul className="menu w-full grow">
          {menuItems.map((item) => {
            // ─── Item con submenú (Facturación) ───────────────────────
            if (item.children) {
              const isActive = item.children.some((c) => c.view === activeView);
              return (
                <li key={item.name}>
                  <button
                    onClick={() => handleGroupClick(item)}
                    className={`flex items-center gap-4 py-4 px-2.5 rounded-xl transition-all w-full ${
                      isActive
                        ? "bg-primary/10 text-primary active"
                        : "hover:bg-base-300"
                    }`}
                  >
                    <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                    <span className="text-[15px] is-drawer-close:hidden flex-1 text-left">
                      {item.name}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`is-drawer-close:hidden opacity-50 transition-transform ${
                        facturacionExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isOpen && facturacionExpanded && (
                    <ul className="ml-4 mt-1 mb-1 flex flex-col gap-1 border-l border-base-content/10 pl-3">
                      {item.children.map((sub) => {
                        const subActive = activeView === sub.view;
                        return (
                          <li key={sub.name}>
                            <button
                              onClick={() => onNavigate(sub.view)}
                              className={`flex items-center gap-3 py-2 px-2.5 rounded-lg text-sm w-full transition-all ${
                                subActive
                                  ? "bg-primary/10 text-primary font-semibold"
                                  : "hover:bg-base-300 opacity-70"
                              }`}
                            >
                              <sub.icon
                                size={18}
                                strokeWidth={subActive ? 2.5 : 2}
                              />
                              {sub.name}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            }

            // ─── Item simple (resto de secciones) ─────────────────────
            const isActive = activeView === item.view;
            return (
              <li key={item.name}>
                <button
                  onClick={() => onNavigate(item.view!)}
                  className={`flex items-center gap-4 py-4 px-2.5 rounded-xl transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary active"
                      : "hover:bg-base-300"
                  }`}
                >
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[15px] is-drawer-close:hidden">
                    {item.name}
                  </span>
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
              v2.0.0 - tourmanager-IA
            </div>
          </div>
        </ul>
      </div>

      {/* Modal de elección cuando la sidebar está colapsada */}
      {groupModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setGroupModal(null);
          }}
        >
          <div className="bg-base-100 rounded-2xl shadow-xl w-full max-w-xs p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-sm font-bold">{groupModal.name}</h3>
              <button
                onClick={() => setGroupModal(null)}
                className="opacity-40 hover:opacity-80"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
            {groupModal.children!.map((sub) => (
              <button
                key={sub.name}
                onClick={() => {
                  onNavigate(sub.view);
                  setGroupModal(null);
                }}
                className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-base-300 transition-all text-sm font-medium"
              >
                <sub.icon size={18} />
                {sub.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Sidebar;

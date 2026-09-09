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

export default function Sidebar({ activeView, onNavigate }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark" | "system">(
    "system",
  );
  const [facturacionExpanded, setFacturacionExpanded] = useState(
    activeView === "facturacion" || activeView === "voucher",
  );
  const [groupModal, setGroupModal] = useState<MenuItem | null>(null);

  useEffect(() => {
    if (activeView === "facturacion" || activeView === "voucher") {
      setFacturacionExpanded(true);
    }
  }, [activeView]);

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
      // Si ya está abierto este ítem, lo cierra; si no, lo abre
      setGroupModal(groupModal?.name === item.name ? null : item);
    } else {
      setFacturacionExpanded((prev) => !prev);
    }
  };

  return (
    <aside
      className={`hidden lg:flex flex-col h-screen sticky top-0 bg-base-200 border-r border-base-content/10 transition-all duration-300 z-30 ${
        isOpen ? "w-64" : "w-16"
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
          onClick={() => {
            setIsOpen(!isOpen);
            setGroupModal(null);
          }}
          className="p-2 rounded-xl hover:bg-base-300 transition-colors mx-auto"
          title={isOpen ? "Colapsar menú" : "Expandir menú"}
        >
          {isOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
        </button>
      </div>

      {/* Navegación (overflow-visible si está cerrado para permitir el Tooltip flotante) */}
      <div
        className={`flex-1 px-2 py-3 flex flex-col justify-between ${
          isOpen ? "overflow-y-auto" : "overflow-visible"
        }`}
      >
        <ul className="space-y-1">
          {menuItems.map((item) => {
            if (item.children) {
              const isActive = item.children.some((c) => c.view === activeView);
              const isModalOpen = !isOpen && groupModal?.name === item.name;

              return (
                <li key={item.name} className="relative">
                  <button
                    onClick={() => handleGroupClick(item)}
                    className={`w-full flex items-center gap-3 py-3 px-3 rounded-xl transition-all ${
                      isActive || isModalOpen
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
                      <>
                        <span className="text-sm flex-1 text-left whitespace-nowrap">
                          {item.name}
                        </span>
                        <ChevronDown
                          size={16}
                          className={`opacity-50 transition-transform duration-200 shrink-0 ${
                            facturacionExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </>
                    )}
                  </button>

                  {/* Submenú desplegable inline (Sidebar ABIERTA) */}
                  {isOpen && facturacionExpanded && (
                    <ul className="ml-4 mt-1 space-y-1 border-l-2 border-base-content/10 pl-2">
                      {item.children.map((sub) => {
                        const subActive = activeView === sub.view;
                        return (
                          <li key={sub.name}>
                            <button
                              onClick={() => onNavigate(sub.view)}
                              className={`w-full flex items-center gap-2.5 py-2 px-2.5 rounded-lg text-sm transition-all ${
                                subActive
                                  ? "bg-primary/15 text-primary font-semibold"
                                  : "hover:bg-base-300 opacity-70 hover:opacity-100"
                              }`}
                            >
                              <sub.icon
                                size={18}
                                className="shrink-0"
                                strokeWidth={subActive ? 2.5 : 2}
                              />
                              <span className="whitespace-nowrap">
                                {sub.name}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* Burbuja estilo Cómic / Tooltip Popover (Sidebar CERRADA) */}
                  {isModalOpen && (
                    <>
                      {/* Fondo invisible para cerrar al hacer clic afuera */}
                      <div
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => setGroupModal(null)}
                      />

                      {/* Contenedor de la burbuja */}
                      <div className="absolute left-full top-0 ml-3 z-50 w-52 bg-base-100 text-base-content rounded-2xl p-2.5 shadow-2xl border border-base-content/10 animate-in fade-in zoom-in-95 duration-150">
                        {/* Viñeta / Colita apuntando al icono de la izquierda */}
                        <div className="absolute -left-2 top-4 w-3.5 h-3.5 bg-base-100 rotate-45 border-l border-b border-base-content/10" />

                        {/* Contenido del menú */}
                        <div className="relative z-10 flex flex-col gap-1">
                          <div className="px-2 py-1 mb-1 border-b border-base-content/10">
                            <span className="text-[11px] font-bold opacity-50 uppercase tracking-wider">
                              {item.name}
                            </span>
                          </div>

                          {item.children.map((sub) => {
                            const subActive = activeView === sub.view;
                            return (
                              <button
                                key={sub.name}
                                onClick={() => {
                                  onNavigate(sub.view);
                                  setGroupModal(null);
                                }}
                                className={`flex items-center gap-3 p-2.5 rounded-xl transition-all text-sm font-medium ${
                                  subActive
                                    ? "bg-primary/10 text-primary font-bold"
                                    : "hover:bg-base-200 opacity-80 hover:opacity-100"
                                }`}
                              >
                                <sub.icon size={18} className="shrink-0" />
                                <span className="whitespace-nowrap">
                                  {sub.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </li>
              );
            }

            const isActive = activeView === item.view;
            return (
              <li key={item.name}>
                <button
                  onClick={() => {
                    onNavigate(item.view!);
                    setGroupModal(null);
                  }}
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

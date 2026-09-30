import { useEffect, useState } from "react";
import {
  BarChart3,
  Users,
  Calendar,
  SlidersHorizontal,
  Receipt,
  FileText,
  Ticket,
  ChevronDown,
  Sun,
  Moon,
  PanelLeftOpen,
  PanelLeftClose,
  FolderOpen,
} from "lucide-react";
import type { ActiveView } from "../DashboardLayout";
import { useAuth } from "../../login/AuthContext";

interface Props {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
}

interface MenuLeaf {
  name: string;
  icon: React.ElementType;
  view: ActiveView;
  adminOnly?: boolean; // ← opción para restringir por rol
}

interface MenuGroup {
  name: string;
  icon: React.ElementType;
  children: MenuLeaf[];
}

type MenuEntry = MenuLeaf | MenuGroup;

function isGroup(entry: MenuEntry): entry is MenuGroup {
  return "children" in entry;
}

// Lista de ítems del menú (Directorio tiene adminOnly: true)
const menuItems: MenuEntry[] = [
  { name: "Métricas", view: "metricas", icon: BarChart3 },
  { name: "Guías", view: "guias", icon: Users },
  { name: "Calendario", view: "calendario", icon: Calendar },
  { name: "Disponibilidad", view: "disponibilidad", icon: SlidersHorizontal },
  { name: "Directorio", view: "directorio", icon: FolderOpen, adminOnly: true },
  {
    name: "Facturación",
    icon: Receipt,
    children: [
      { name: "Factura", view: "facturacion", icon: FileText },
      { name: "Voucher", view: "voucher", icon: Ticket },
    ],
  },
];

// Grupo que contiene la vista activa (para abrirlo solo).
function groupOf(view: ActiveView): string | null {
  for (const entry of menuItems) {
    if (isGroup(entry) && entry.children.some((c) => c.view === view)) {
      return entry.name;
    }
  }
  return null;
}

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function Sidebar({ activeView, onNavigate }: Props) {
  const { isAdmin } = useAuth(); // ← Obtenemos el rol desde el contexto de autenticación
  const [isOpen, setIsOpen] = useState(true);
  const [openGroup, setOpenGroup] = useState<string | null>(() =>
    groupOf(activeView),
  );
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const isDark = theme === "dark";

  useEffect(() => {
    const group = groupOf(activeView);
    if (group) setOpenGroup(group);
  }, [activeView]);

  const changeTheme = (next: Theme) => {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  const handleGroupClick = (name: string) => {
    if (!isOpen) {
      setIsOpen(true);
      setOpenGroup(name);
      return;
    }
    setOpenGroup((current) => (current === name ? null : name));
  };

  return (
    <aside
      className={`hidden lg:flex flex-col h-screen shrink-0 sticky top-0 bg-base-200 border-r border-base-content/10 transition-all duration-300 z-30 ${
        isOpen ? "w-56" : "w-16"
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
          {menuItems.map((entry) => {
            // Ocultar elementos marcados como solo para admin si no es admin
            if (!isGroup(entry) && entry.adminOnly && !isAdmin) {
              return null;
            }

            // ── Grupo con submenú ──
            if (isGroup(entry)) {
              const groupActive = entry.children.some(
                (c) => c.view === activeView,
              );
              const expanded = isOpen && openGroup === entry.name;

              return (
                <li key={entry.name}>
                  <button
                    onClick={() => handleGroupClick(entry.name)}
                    aria-expanded={expanded}
                    className={`w-full flex items-center gap-3 py-3 px-3 rounded-xl transition-all ${
                      groupActive
                        ? "text-primary font-semibold"
                        : "hover:bg-base-300 opacity-80 hover:opacity-100"
                    } ${groupActive && !isOpen ? "bg-primary/10" : ""} ${
                      !isOpen ? "justify-center" : ""
                    }`}
                  >
                    <entry.icon
                      size={22}
                      className="shrink-0"
                      strokeWidth={groupActive ? 2.5 : 2}
                    />
                    {isOpen && (
                      <>
                        <span className="text-sm whitespace-nowrap">
                          {entry.name}
                        </span>
                        <ChevronDown
                          size={16}
                          className={`ml-auto shrink-0 transition-transform ${
                            expanded ? "rotate-180" : ""
                          }`}
                        />
                      </>
                    )}
                  </button>

                  {expanded && (
                    <ul className="mt-1 ml-5 pl-3 border-l border-base-content/10 space-y-1">
                      {entry.children.map((child) => {
                        if (child.adminOnly && !isAdmin) return null;
                        const isActive = activeView === child.view;
                        return (
                          <li key={child.view}>
                            <button
                              onClick={() => onNavigate(child.view)}
                              className={`w-full flex items-center gap-2.5 py-2 px-3 rounded-xl transition-all text-sm ${
                                isActive
                                  ? "bg-primary/10 text-primary font-semibold"
                                  : "hover:bg-base-300 opacity-80 hover:opacity-100"
                              }`}
                            >
                              <child.icon
                                size={18}
                                className="shrink-0"
                                strokeWidth={isActive ? 2.5 : 2}
                              />
                              <span className="whitespace-nowrap">
                                {child.name}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            }

            // ── Entrada simple ──
            const isActive = activeView === entry.view;
            return (
              <li key={entry.name}>
                <button
                  onClick={() => onNavigate(entry.view)}
                  className={`w-full flex items-center gap-3 py-3 px-3 rounded-xl transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "hover:bg-base-300 opacity-80 hover:opacity-100"
                  } ${!isOpen ? "justify-center" : ""}`}
                >
                  <entry.icon
                    size={22}
                    className="shrink-0"
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  {isOpen && (
                    <span className="text-sm whitespace-nowrap">
                      {entry.name}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Tema y versión */}
        <div className="pt-4 border-t border-base-content/10 space-y-2">
          {isOpen ? (
            <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-base-300 transition-colors cursor-pointer">
              <span className="flex items-center gap-3 text-sm opacity-80">
                {isDark ? (
                  <Moon size={20} className="shrink-0" />
                ) : (
                  <Sun size={20} className="shrink-0" />
                )}
                {isDark ? "Tema oscuro" : "Tema claro"}
              </span>
              <input
                type="checkbox"
                className="toggle toggle-sm"
                checked={isDark}
                onChange={(e) =>
                  changeTheme(e.target.checked ? "dark" : "light")
                }
                aria-label="Activar tema oscuro"
              />
            </label>
          ) : (
            <label
              className="swap swap-rotate w-full py-2 rounded-xl hover:bg-base-300 transition-colors cursor-pointer"
              title={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            >
              <input
                type="checkbox"
                checked={isDark}
                onChange={(e) =>
                  changeTheme(e.target.checked ? "dark" : "light")
                }
                aria-label="Activar tema oscuro"
              />
              <Moon size={20} className="swap-on" />
              <Sun size={20} className="swap-off" />
            </label>
          )}

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

import {
  BarChart3,
  Users,
  Calendar,
  SlidersHorizontal,
  Ticket,
} from "lucide-react";
import type { ActiveView } from "../DashboardLayout";

interface Props {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
}

export default function MobileMenu({ activeView, onNavigate }: Props) {
  const navItems = [
    { id: "metricas", label: "Métricas", icon: BarChart3 },
    { id: "guias", label: "Guías", icon: Users },
    { id: "calendario", label: "Calendario", icon: Calendar },
    { id: "disponibilidad", label: "Dispo.", icon: SlidersHorizontal },
    { id: "voucher", label: "Voucher", icon: Ticket },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-base-200/95 backdrop-blur-md border-t border-base-content/10 flex items-center justify-around px-1 lg:hidden">
      {navItems.map((item) => {
        const isActive = activeView === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
              isActive
                ? "text-primary font-bold"
                : "opacity-60 hover:opacity-100"
            }`}
          >
            <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            <span className="text-[10px] mt-1 tracking-tight">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
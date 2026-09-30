import { useState } from "react";
import {
  BarChart3,
  Users,
  Calendar,
  SlidersHorizontal,
  Receipt,
  FileText,
  Ticket,
} from "lucide-react";
import type { ActiveView } from "../DashboardLayout";

interface Props {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
}

const navItems = [
  { id: "metricas", label: "Métricas", icon: BarChart3 },
  { id: "guias", label: "Guías", icon: Users },
  { id: "calendario", label: "Calendario", icon: Calendar },
  { id: "disponibilidad", label: "Dispo.", icon: SlidersHorizontal },
] as const;

const billingItems = [
  { id: "facturacion", label: "Factura", icon: FileText },
  { id: "voucher", label: "Voucher", icon: Ticket },
] as const;

export default function MobileMenu({ activeView, onNavigate }: Props) {
  const [billingOpen, setBillingOpen] = useState(false);
  const billingActive = billingItems.some((item) => item.id === activeView);

  const go = (view: ActiveView) => {
    setBillingOpen(false);
    onNavigate(view);
  };

  return (
    <>
      {/* Cierra el submenú al tocar fuera */}
      {billingOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          onClick={() => setBillingOpen(false)}
        />
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-base-200/95 backdrop-blur-md border-t border-base-content/10 flex items-center justify-around px-1 lg:hidden">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => go(item.id)}
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

        {/* Facturación: abre un pequeño menú con Factura y Voucher */}
        <button
          onClick={() => setBillingOpen((open) => !open)}
          aria-expanded={billingOpen}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
            billingActive || billingOpen
              ? "text-primary font-bold"
              : "opacity-60 hover:opacity-100"
          }`}
        >
          <Receipt size={20} strokeWidth={billingActive ? 2.5 : 2} />
          <span className="text-[10px] mt-1 tracking-tight">Facturación</span>
        </button>

        {billingOpen && (
          <div className="absolute right-2 bottom-full mb-2 w-44 rounded-2xl bg-base-100 border border-base-content/10 shadow-lg p-1.5 flex flex-col gap-1">
            {billingItems.map((item) => {
              const isActive = activeView === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => go(item.id)}
                  className={`flex items-center gap-2.5 py-2.5 px-3 rounded-xl text-sm transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "hover:bg-base-200"
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </nav>
    </>
  );
}
import { useState } from "react";
import {
  BarChart3,
  Users,
  Calendar,
  SlidersHorizontal,
  Wallet,
  Receipt,
  Ticket,
  X,
} from "lucide-react";
import type { ActiveView } from "../DashboardLayout";

interface Props {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
}

export default function MobileMenu({ activeView, onNavigate }: Props) {
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);

  const isBillingActive =
    activeView === "facturacion" || activeView === "voucher";

  const handleSelectOption = (view: ActiveView) => {
    onNavigate(view);
    setIsBillingModalOpen(false);
  };

  const navItems = [
    { id: "metricas", label: "Métricas", icon: BarChart3 },
    { id: "guias", label: "Guías", icon: Users },
    { id: "calendario", label: "Calendario", icon: Calendar },
    { id: "disponibilidad", label: "Dispo.", icon: SlidersHorizontal },
  ] as const;

  return (
    <>
      {/* Footer Móvil con alineación Flexbox estricta */}
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

        {/* Botón Facturación */}
        <button
          onClick={() => setIsBillingModalOpen(true)}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
            isBillingActive
              ? "text-primary font-bold"
              : "opacity-60 hover:opacity-100"
          }`}
        >
          <Wallet size={20} strokeWidth={isBillingActive ? 2.5 : 2} />
          <span className="text-[10px] mt-1 tracking-tight">Facturación</span>
        </button>
      </nav>

      {/* Submenú Modal Bottom Sheet */}
      <dialog
        className={`modal modal-bottom sm:modal-middle ${isBillingModalOpen ? "modal-open" : ""}`}
      >
        <div className="modal-box bg-base-100 rounded-t-3xl border-t border-base-content/10 p-5">
          <div className="w-12 h-1.5 bg-base-content/20 rounded-full mx-auto mb-4" />

          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base tracking-tight flex items-center gap-2">
              <Wallet size={18} className="text-primary" />
              Opciones de Facturación
            </h3>
            <button
              onClick={() => setIsBillingModalOpen(false)}
              className="btn btn-sm btn-circle btn-ghost opacity-60 hover:opacity-100"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 my-2">
            <button
              onClick={() => handleSelectOption("facturacion")}
              className={`flex items-center gap-4 p-4 rounded-2xl transition-all border ${
                activeView === "facturacion"
                  ? "bg-primary/10 border-primary text-primary font-semibold"
                  : "bg-base-200/60 border-transparent hover:bg-base-200"
              }`}
            >
              <div className="p-2.5 rounded-xl bg-base-100 shadow-sm">
                <Receipt size={22} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold">Facturación</p>
                <p className="text-xs opacity-60">
                  Gestión de facturas e ingresos
                </p>
              </div>
            </button>

            <button
              onClick={() => handleSelectOption("voucher")}
              className={`flex items-center gap-4 p-4 rounded-2xl transition-all border ${
                activeView === "voucher"
                  ? "bg-primary/10 border-primary text-primary font-semibold"
                  : "bg-base-200/60 border-transparent hover:bg-base-200"
              }`}
            >
              <div className="p-2.5 rounded-xl bg-base-100 shadow-sm">
                <Ticket size={22} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold">Voucher</p>
                <p className="text-xs opacity-60">
                  Generador de comprobantes de pago
                </p>
              </div>
            </button>
          </div>
        </div>

        <form method="dialog" className="modal-backdrop">
          <button onClick={() => setIsBillingModalOpen(false)}>close</button>
        </form>
      </dialog>
    </>
  );
}

import { useState } from "react";
import { Bell, Wrench } from "lucide-react";
import { useNotifications } from "./UseNotifications";

export default function NotificationBell() {
  const { unreadCount } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      {/* Botón de la Campana */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-ghost btn-circle btn-sm relative text-base-content/70 hover:text-base-content"
        aria-label="Notificaciones"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error ring-2 ring-base-100" />
        )}
      </button>

      {/* Popover / Menú desplegable de notificaciones */}
      {isOpen && (
        <>
          {/* Overlay transparente para cerrar al hacer clic fuera */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute right-0 mt-2 w-80 bg-base-100 border border-base-content/10 shadow-xl rounded-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-base-content/5 mb-3">
              <span className="font-bold text-sm">Notificaciones</span>
              <span className="badge badge-xs badge-ghost text-[10px] py-2 px-2">
                En pruebas
              </span>
            </div>

            <div className="flex flex-col items-center justify-center py-6 text-center gap-2 opacity-60">
              <div className="w-10 h-10 rounded-full bg-base-200 flex items-center justify-center">
                <Wrench size={18} />
              </div>
              <p className="text-xs font-medium">Módulo en mantenimiento</p>
              <span className="text-[10px] text-base-content/50">
                Las alertas se activarán próximamente
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
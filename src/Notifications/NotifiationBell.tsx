import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck, Trash2, X } from "lucide-react";
import {
  useNotifications,
  type Notification,
  type NotifType,
} from "./UseNotifications";

// ─── COLORES POR TIPO ─────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<
  NotifType,
  { label: string; dot: string; bg: string; text: string }
> = {
  reservation: {
    label: "Nueva reserva",
    dot: "bg-success",
    bg: "bg-success/10",
    text: "text-success",
  },
  modification: {
    label: "Modificación",
    dot: "bg-info",
    bg: "bg-info/10",
    text: "text-info",
  },
  cancellation: {
    label: "Cancelación",
    dot: "bg-error",
    bg: "bg-error/10",
    text: "text-error",
  },
};

// ─── ITEM DE NOTIFICACIÓN ─────────────────────────────────────────────────────
function NotifItem({
  notif,
  onRead,
  onDelete,
}: {
  notif: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = TYPE_CONFIG[notif.type];
  const time = new Date(notif.created_at).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={[
        "flex items-start gap-3 px-4 py-3 border-b border-base-content/5 last:border-b-0",
        "hover:bg-base-content/3 transition-colors group",
        !notif.read ? "bg-base-content/[0.02]" : "",
      ].join(" ")}
    >
      {/* Dot tipo */}
      <div className="mt-1.5 shrink-0">
        <div
          className={`w-2 h-2 rounded-full ${notif.read ? "bg-base-content/20" : cfg.dot}`}
        />
      </div>

      {/* Contenido */}
      <div
        className="flex-1 min-w-0"
        onClick={() => !notif.read && onRead(notif.id)}
      >
        <div
          className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${notif.read ? "opacity-30" : cfg.text}`}
        >
          {cfg.label}
        </div>
        <p
          className={`text-xs leading-snug ${notif.read ? "opacity-40" : "text-base-content"}`}
        >
          {notif.message}
        </p>
        <span className="text-[10px] opacity-30 mt-0.5 block">{time}</span>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {!notif.read && (
          <button
            onClick={() => onRead(notif.id)}
            className="btn btn-ghost btn-circle btn-xs text-base-content/40 hover:text-success"
            title="Marcar como leída"
          >
            <Check size={12} />
          </button>
        )}
        <button
          onClick={() => onDelete(notif.id)}
          className="btn btn-ghost btn-circle btn-xs text-base-content/40 hover:text-error"
          title="Eliminar"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL — Desktop ──────────────────────────────────────────
export default function NotificationBell() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al clicar fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Botón campana */}
      <button
        onClick={() => setOpen(!open)}
        className="btn btn-ghost btn-circle btn-sm text-base-content/50 hover:text-base-content relative"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-error text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel dropdown */}
      {open && (
        <div className="absolute right-0 top-10 w-80 bg-base-100 border border-base-content/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-base-content">
                Notificaciones
              </span>
              {unreadCount > 0 && (
                <span className="bg-error/10 text-error text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount} nuevas
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="btn btn-ghost btn-xs gap-1 text-base-content/40 hover:text-base-content"
                  title="Marcar todo como leído"
                >
                  <CheckCheck size={13} />
                  <span className="text-[10px]">Todo leído</span>
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="btn btn-ghost btn-circle btn-xs text-base-content/30"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-[380px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 opacity-20">
                <Bell size={24} />
                <span className="text-xs">Sin notificaciones</span>
              </div>
            ) : (
              notifications.map((n) => (
                <NotifItem
                  key={n.id}
                  notif={n}
                  onRead={markAsRead}
                  onDelete={deleteNotification}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

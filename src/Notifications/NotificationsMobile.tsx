import { useState } from "react";
import { Bell, Check, CheckCheck, Trash2, X } from "lucide-react";
import { useNotifications, type Notification, type NotifType } from "./UseNotifications";

// ─── COLORES POR TIPO ─────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<NotifType, { label: string; dot: string; text: string }> = {
  reservation:  { label: "Nueva reserva", dot: "bg-success", text: "text-success" },
  modification: { label: "Modificación",  dot: "bg-info",    text: "text-info"    },
  cancellation: { label: "Cancelación",   dot: "bg-error",   text: "text-error"   },
};

// ─── ITEM ─────────────────────────────────────────────────────────────────────
function NotifItem({ notif, onRead, onDelete }: {
  notif:    Notification;
  onRead:   (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg  = TYPE_CONFIG[notif.type];
  const time = new Date(notif.created_at).toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div
      className={[
        "flex items-start gap-3 px-4 py-3 border-b border-base-content/5 last:border-b-0",
        !notif.read ? "bg-base-content/[0.02]" : "",
      ].join(" ")}
      onClick={() => !notif.read && onRead(notif.id)}
    >
      <div className="mt-1.5 shrink-0">
        <div className={`w-2 h-2 rounded-full ${notif.read ? "bg-base-content/20" : cfg.dot}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${notif.read ? "opacity-30" : cfg.text}`}>
          {cfg.label}
        </div>
        <p className={`text-xs leading-snug ${notif.read ? "opacity-40" : "text-base-content"}`}>
          {notif.message}
        </p>
        <span className="text-[10px] opacity-30 mt-0.5 block">{time}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!notif.read && (
          <button
            onClick={(e) => { e.stopPropagation(); onRead(notif.id); }}
            className="btn btn-ghost btn-circle btn-xs text-base-content/40 hover:text-success"
          >
            <Check size={12} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(notif.id); }}
          className="btn btn-ghost btn-circle btn-xs text-base-content/40 hover:text-error"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── COMPONENTE MÓVIL — botón + modal bottom sheet ────────────────────────────
interface Props {
  isActive: boolean;
  onClick:  () => void;
}

export default function NotificationsMobile({ isActive, onClick }: Props) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    onClick();
    setOpen(true);
  };

  return (
    <>
      {/* Botón en el MobileMenu */}
      <button
        onClick={handleClick}
        className="flex flex-col items-center justify-center gap-1 flex-1 h-full active:scale-90 transition-transform"
      >
        <div className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${isActive ? "bg-primary/10" : ""}`}>
          <div className="relative">
            <Bell
              size={22}
              strokeWidth={isActive ? 2.5 : 1.8}
              className={isActive ? "text-primary" : "text-base-content opacity-40"}
            />
            {/* Punto rojo — solo si hay no leídas */}
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-error ring-1 ring-base-100" />
            )}
          </div>
          <span className={`text-[10px] font-medium ${isActive ? "text-primary" : "text-base-content opacity-40"}`}>
            Avisos
          </span>
        </div>
      </button>

      {/* Modal bottom sheet */}
      {open && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="relative bg-base-100 rounded-t-2xl h-[72vh] flex flex-col">

            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1.5 rounded-full bg-base-content/25" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">Notificaciones</span>
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
                    className="btn btn-ghost btn-xs gap-1 text-base-content/40"
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
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 opacity-20">
                  <Bell size={28} />
                  <span className="text-sm">Sin notificaciones</span>
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
        </div>
      )}
    </>
  );
}
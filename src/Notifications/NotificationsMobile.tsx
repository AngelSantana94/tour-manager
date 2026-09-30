import { useState } from "react";
import { Bell, X, Wrench } from "lucide-react";

interface Props {
  isActive: boolean;
  onClick: () => void;
}

export default function NotificationsMobile({ isActive, onClick }: Props) {
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    onClick();
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="flex flex-col items-center justify-center gap-1 flex-1 h-full active:scale-90 transition-transform"
      >
        <div
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${isActive ? "bg-primary/10" : ""}`}
        >
          <Bell
            size={22}
            strokeWidth={isActive ? 2.5 : 1.8}
            className={
              isActive ? "text-primary" : "text-base-content opacity-40"
            }
          />
          <span
            className={`text-[10px] font-medium ${isActive ? "text-primary" : "text-base-content opacity-40"}`}
          >
            Avisos
          </span>
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative bg-base-100 rounded-t-2xl p-6 flex flex-col items-center text-center gap-3">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 btn btn-ghost btn-circle btn-xs"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center text-warning mt-2">
              <Wrench size={24} />
            </div>
            <h3 className="font-bold text-base">
              Notificaciones en construcción
            </h3>
            <p className="text-xs opacity-60">
              Próximamente podrás ver tus alertas y eventos en tiempo real aquí.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

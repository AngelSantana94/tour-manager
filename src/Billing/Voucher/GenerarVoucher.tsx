import { Wrench, FileText } from "lucide-react";

export default function GenerarVoucher() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
        <Wrench size={32} />
      </div>
      <h2 className="text-xl font-bold mb-2">
        Módulo de Vouchers y Facturación
      </h2>
      <p className="text-sm opacity-60 max-w-sm mb-4">
        Esta sección se encuentra temporalmente en mantenimiento mientras
        optimizamos la base de datos.
      </p>
      <div className="badge badge-ghost gap-2 py-3 px-4 text-xs">
        <FileText size={14} /> Próximamente disponible
      </div>
    </div>
  );
}

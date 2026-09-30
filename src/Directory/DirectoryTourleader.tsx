import type { DirectoryItem } from "./Services/Directory.adapter";
import DirectoryList from "./DirectoryList";

interface DirectoryTourLeaderProps {
  items: DirectoryItem[];
  onChanged: () => Promise<void>;
}

// Guías correo (tabla `tour_leaders`) de un proveedor. Hoy solo renombrar y
// fusionar; si más adelante hay acciones propias (editar teléfono, notas,
// operador habitual...), se añaden aquí sin tocar la pestaña de operadores.
export default function DirectoryTourLeader({
  items,
  onChanged,
}: DirectoryTourLeaderProps) {
  return <DirectoryList kind="leader" items={items} onChanged={onChanged} />;
}
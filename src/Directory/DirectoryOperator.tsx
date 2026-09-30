import type { DirectoryItem } from "./Services/Directory.adapter";
import DirectoryList from "./DirectoryList";

interface DirectoryOperatorProps {
  items: DirectoryItem[];
  onChanged: () => Promise<void>;
}

// Operadores de un proveedor. Hoy solo renombrar y fusionar; si más adelante
// hay acciones propias de operadores (contacto, proveedor por defecto...),
// se añaden aquí sin tocar la pestaña de guías correo.
export default function DirectoryOperator({
  items,
  onChanged,
}: DirectoryOperatorProps) {
  return <DirectoryList kind="operator" items={items} onChanged={onChanged} />;
}
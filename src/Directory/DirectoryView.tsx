import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchIsAdmin } from "../Calendars/Services/Supabase.adapter";
import {
  fetchDirectory,
  type DirectoryData,
} from "./Services/Directory.adapter";
import DirectoryProvider, {
  ProviderCard,
  type ProviderData,
} from "./DirectoryProvider";
import { errorMessage } from "./DirectoryUtils";

// Clave con la que se abre la tarjeta "Sin proveedor" (no tiene id real).
const NONE = "__none__";

export default function DirectoryView() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [data, setData] = useState<DirectoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchDirectory());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIsAdmin()
      .then((ok) => {
        setIsAdmin(ok);
        if (ok) load();
        else setLoading(false);
      })
      .catch(() => {
        setIsAdmin(false);
        setLoading(false);
      });
  }, [load]);

  // Proveedores reales + (si hace falta) la tarjeta "Sin proveedor".
  const providers = useMemo<ProviderData[]>(() => {
    if (!data) return [];

    const list: ProviderData[] = data.providers.map((p) => ({
      id: p.id,
      name: p.name,
      operators: p.operators,
      leaders: p.leaders,
    }));

    const { operators, leaders } = data.unassigned;
    if (operators.length > 0 || leaders.length > 0) {
      list.push({ id: null, name: "Sin proveedor", operators, leaders });
    }

    return list;
  }, [data]);

  const open = openKey
    ? (providers.find((p) => (p.id ?? NONE) === openKey) ?? null)
    : null;

  if (isAdmin === false) {
    return (
      <div className="p-6 text-sm opacity-70">
        Esta sección es solo para la coordinadora.
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-sm opacity-60">Cargando directorio...</div>;
  }

  if (error || !data) {
    return (
      <div className="p-6 text-sm text-error">
        {error ?? "No se pudo cargar el directorio."}
      </div>
    );
  }

  // ── Detalle de un proveedor ──
  if (open) {
    return (
      <DirectoryProvider
        key={openKey}
        provider={open}
        onBack={() => setOpenKey(null)}
        onChanged={load}
      />
    );
  }

  // ── Cuadrícula de proveedores ──
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-bold">Directorio</h1>
      <p className="text-sm opacity-60 mt-1 mb-5">
        Proveedores con sus operadores y guías correo. Entra en uno para
        corregir nombres o fusionar duplicados.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((p) => (
          <ProviderCard
            key={p.id ?? NONE}
            provider={p}
            onOpen={() => setOpenKey(p.id ?? NONE)}
          />
        ))}
      </div>

      {providers.length === 0 && (
        <p className="text-sm opacity-50 mt-6">Todavía no hay proveedores.</p>
      )}
    </div>
  );
}

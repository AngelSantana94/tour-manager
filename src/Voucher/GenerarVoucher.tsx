import { useEffect, useState } from "react";
import { Download, Share2, Trash2, X } from "lucide-react";
import { useAuth } from "../login/AuthContext";
// Cliente real de Supabase (base de datos OTA) — mismo que usa el resto
// de la app, importado directamente de su origen en vez de pasar por el
// adaptador del calendario para no acoplar el voucher a ese módulo.
import { supabase } from "../lib/supabaseClientOTA";

interface VoucherFormData {
  empresa: string;
  nif: string;
  direccion: string;
  cpCiudad: string;
  guiaTour: string;
  concepto: string;
  importe: string;
  pax: string;
  guiaEncargado: string;
}

interface VoucherResult {
  id: string;
  pdfUrl: string;
}

interface DatosEmpresa {
  nif: string;
  direccion: string;
  cpCiudad: string;
}

const CAMPOS_VACIOS: VoucherFormData = {
  empresa: "",
  nif: "",
  direccion: "",
  cpCiudad: "",
  guiaTour: "",
  concepto: "",
  importe: "",
  pax: "",
  guiaEncargado: "",
};

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface GenerarVoucherProps {
  open: boolean;
  onClose: () => void;
}

export default function GenerarVoucher({ open, onClose }: GenerarVoucherProps) {
  const { profile } = useAuth();

  const [form, setForm] = useState<VoucherFormData>(CAMPOS_VACIOS);
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState<VoucherResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  // Historial propio del guía (RLS ya se encarga de que solo veamos
  // nuestros propios vouchers): empresas -> sus últimos datos fiscales,
  // y la lista de guías de tour usados antes. Alimenta los <datalist>
  // y el autorrelleno al elegir una empresa ya conocida.
  const [empresasConocidas, setEmpresasConocidas] = useState<
    Record<string, DatosEmpresa>
  >({});
  const [guiasConocidas, setGuiasConocidas] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;

    (async () => {
      const { data, error } = await supabase
        .from("vouchers")
        .select("empresa, nif, direccion, cp_ciudad, guia_tour, created_at")
        .order("created_at", { ascending: false });

      if (error || !data) return;

      const empresas: Record<string, DatosEmpresa> = {};
      const guias = new Set<string>();

      for (const fila of data) {
        // El primero que aparece por empresa es el más reciente (ya viene
        // ordenado descendente), así que si ya está registrada no la
        // pisamos con una versión más vieja.
        const clave = fila.empresa.trim().toLowerCase();
        if (!empresas[clave]) {
          empresas[clave] = {
            nif: fila.nif,
            direccion: fila.direccion,
            cpCiudad: fila.cp_ciudad,
          };
        }
        if (fila.guia_tour?.trim()) guias.add(fila.guia_tour.trim());
      }

      setEmpresasConocidas(empresas);
      setGuiasConocidas(Array.from(guias).sort());
    })();
  }, [open]);

  if (!open) return null;

  const camposCompletos = Object.values(form).every(
    (valor) => valor.trim() !== "",
  );

  const handleChange = (campo: keyof VoucherFormData, valor: string) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  // Al salir del campo Empresa, si coincide con una que ya conocemos,
  // autorrellenamos NIF / Dirección / CP+Ciudad con sus últimos datos.
  const handleEmpresaBlur = () => {
    const clave = form.empresa.trim().toLowerCase();
    const conocida = empresasConocidas[clave];
    if (!conocida) return;

    setForm((prev) => ({
      ...prev,
      nif: conocida.nif,
      direccion: conocida.direccion,
      cpCiudad: conocida.cpCiudad,
    }));
  };

  const handleGenerar = async () => {
    if (!camposCompletos || !profile) return;
    setError(null);
    setGenerando(true);

    try {
      const res = await fetch("/api/vouchers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeader()),
        },
        body: JSON.stringify({
          ...form,
          importe: Number(form.importe),
          pax: Number(form.pax),
        }),
      });

      if (!res.ok) throw new Error("No se pudo generar el voucher");

      const data: VoucherResult = await res.json();
      setResultado(data);
      setForm(CAMPOS_VACIOS);
    } catch {
      setError("Ha fallado la generación. Inténtalo de nuevo.");
    } finally {
      setGenerando(false);
    }
  };

  const handleCompartir = async () => {
    if (!resultado) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Voucher", url: resultado.pdfUrl });
      } catch {
        // el usuario cerró el diálogo de compartir, no hacemos nada
      }
    } else {
      await navigator.clipboard.writeText(resultado.pdfUrl);
      alert("Enlace copiado al portapapeles");
    }
  };

  const handleBorrar = async () => {
    if (!resultado) return;
    const confirmar = window.confirm(
      "Esto borra el voucher de forma permanente. ¿Continuar?",
    );
    if (!confirmar) return;

    setBorrando(true);
    try {
      await fetch(`/api/vouchers/${resultado.id}`, {
        method: "DELETE",
        headers: await getAuthHeader(),
      });
      setResultado(null);
    } catch {
      setError("No se pudo borrar el voucher.");
    } finally {
      setBorrando(false);
    }
  };

  const handleLimpiarVentana = () => {
    setResultado(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-base-200 overflow-y-auto">
      {/* Barra superior */}
      <div className="flex items-center justify-between border-b border-base-content/10 bg-base-100 px-5 py-4 sm:px-8">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">
            Generar voucher
          </h1>
          {profile && (
            <p className="text-xs opacity-40 mt-0.5">{profile.name}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="btn btn-sm btn-circle btn-ghost"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mx-auto w-full max-w-xl flex-1 px-5 py-6 sm:px-8">
        {/* Formulario */}
        <div className="bg-base-100 border border-base-content/10 rounded-2xl p-5 space-y-4">
          <Campo
            label="Empresa o persona receptora"
            value={form.empresa}
            onChange={(v) => handleChange("empresa", v)}
            onBlur={handleEmpresaBlur}
            listId="empresas-conocidas"
          />
          {/* datalist con las empresas ya usadas — escribir un nombre nuevo
              que no esté en la lista sigue funcionando con total libertad */}
          <datalist id="empresas-conocidas">
            {Object.keys(empresasConocidas).map((clave) => (
              <option key={clave} value={clave} />
            ))}
          </datalist>

          <Campo
            label="NIF"
            value={form.nif}
            onChange={(v) => handleChange("nif", v)}
          />
          <Campo
            label="Dirección"
            value={form.direccion}
            onChange={(v) => handleChange("direccion", v)}
          />
          <Campo
            label="Código postal y ciudad"
            value={form.cpCiudad}
            onChange={(v) => handleChange("cpCiudad", v)}
          />

          <Campo
            label="Guía del tour"
            value={form.guiaTour}
            onChange={(v) => handleChange("guiaTour", v)}
            listId="guias-conocidas"
          />
          <datalist id="guias-conocidas">
            {guiasConocidas.map((nombre) => (
              <option key={nombre} value={nombre} />
            ))}
          </datalist>

          <Campo
            label="Concepto"
            value={form.concepto}
            onChange={(v) => handleChange("concepto", v)}
            placeholder="Ej. Visita guiada en Brujas"
          />
          <div className="grid grid-cols-2 gap-4">
            <Campo
              label="Importe (€)"
              value={form.importe}
              onChange={(v) => handleChange("importe", v)}
              type="number"
            />
            <Campo
              label="Pax"
              value={form.pax}
              onChange={(v) => handleChange("pax", v)}
              type="number"
            />
          </div>
          <Campo
            label="Guía encargado/a"
            value={form.guiaEncargado}
            onChange={(v) => handleChange("guiaEncargado", v)}
          />
        </div>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <button
          onClick={handleGenerar}
          disabled={!camposCompletos || generando}
          className="btn mt-6 w-full bg-base-content text-base-100 hover:bg-base-content/85 border-none font-semibold disabled:opacity-30"
        >
          {generando ? (
            <>
              <span className="loading loading-spinner loading-sm" />
              Generando voucher…
            </>
          ) : (
            "Generar"
          )}
        </button>

        {/* Resultado */}
        {resultado && (
          <div className="mt-8 bg-base-100 border border-base-content/10 rounded-2xl p-5">
            <h2 className="mb-3 text-xs font-bold opacity-40 uppercase tracking-widest">
              Voucher generado
            </h2>

            <div className="overflow-hidden rounded-xl border border-base-content/10">
              <iframe
                src={resultado.pdfUrl}
                title="Voucher generado"
                className="h-[70vh] w-full"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={handleCompartir}
                className="btn btn-sm gap-2 bg-base-200 hover:bg-base-300 border-none"
              >
                <Share2 size={14} />
                Compartir
              </button>
              <a
                href={resultado.pdfUrl}
                download
                className="btn btn-sm gap-2 bg-base-200 hover:bg-base-300 border-none"
              >
                <Download size={14} />
                Descargar
              </a>
              <button
                onClick={handleBorrar}
                disabled={borrando}
                className="btn btn-sm gap-2 bg-base-100 text-red-500 hover:bg-red-50 border-none disabled:opacity-40"
              >
                {borrando ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Trash2 size={14} />
                )}
                Borrar
              </button>
              <button
                onClick={handleLimpiarVentana}
                className="btn btn-sm btn-ghost ml-auto"
              >
                Limpiar ventana
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  onBlur,
  type = "text",
  placeholder,
  listId,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  onBlur?: () => void;
  type?: string;
  placeholder?: string;
  listId?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold opacity-40 uppercase tracking-wider">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        list={listId}
        className="input input-bordered w-full bg-base-100"
      />
    </label>
  );
}

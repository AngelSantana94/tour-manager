import { useState, useEffect } from "react";
import { Pin, Copy, Plus, Trash2, Edit3, Check, X } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://hccxpmnraefgccowdwri.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY3hwbW5yYWVmZ2Njb3dkd3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjAyNzQsImV4cCI6MjA4ODE5NjI3NH0.QwfoDxbMDXPrCmfGPLsKVzhfLpQBKBVmNwbNm_dIX1E"
);

interface PinType {
  id: string;
  title: string;
  content: string;
  category: string;
}

export default function Pins() {
  const [pins, setPins] = useState<PinType[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pinForm, setPinForm] = useState({ title: "", content: "", category: "General" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPins();
  }, []);

  async function fetchPins() {
    setLoading(true);
    const { data, error } = await supabase
      .from("pines")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setPins(data);
    setLoading(false);
  }

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (editingId) {
      // MODIFICAR
      await supabase.from("pines").update(pinForm).eq("id", editingId);
    } else {
      // CREAR
      await supabase.from("pines").insert([pinForm]);
    }

    setPinForm({ title: "", content: "", category: "General" });
    setEditingId(null);
    setIsModalOpen(false);
    fetchPins();
    setSaving(false);
  };

  const handleEdit = (pin: PinType) => {
    setEditingId(pin.id);
    setPinForm({ title: pin.title, content: pin.content, category: pin.category });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Estás seguro de que quieres eliminar este Pin?")) {
      await supabase.from("pines").delete().eq("id", id);
      fetchPins();
    }
  };

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-4 max-w-5xl mx-auto pb-24">
      {/* Header */}
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-base-content">
            <Pin className="text-primary rotate-45" size={24} />
            Pines
          </h1>
          <p className="text-xs opacity-50">Gestiona tus mensajes rápidos</p>
        </div>
        <button 
          onClick={() => {
            setEditingId(null);
            setPinForm({ title: "", content: "", category: "General" });
            setIsModalOpen(true);
          }} 
          className="btn btn-primary btn-sm gap-2 shadow-lg"
        >
          <Plus size={18} /> Nuevo Pin
        </button>
      </div>

      {/* Grid de Pines */}
      {loading ? (
        <div className="flex justify-center py-10"><span className="loading loading-spinner text-primary"></span></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pins.map((pin) => (
            <div key={pin.id} className="card bg-base-100 border border-base-content/10 shadow-sm hover:shadow-md transition-shadow">
              <div className="p-5">
                <span className="badge badge-ghost badge-xs mb-2 opacity-50 uppercase text-[9px] font-bold">{pin.category}</span>
                <h3 className="font-bold text-lg mb-2 text-base-content leading-tight">{pin.title}</h3>
                <p className="text-sm opacity-70 mb-6 whitespace-pre-wrap italic line-clamp-6">"{pin.content}"</p>
                
                {/* BOTONES: Copiar, Editar, Eliminar */}
                <div className="flex items-center justify-between border-t pt-4 border-base-content/5 mt-auto">
                  <button 
                    onClick={() => handleCopy(pin.content, pin.id)}
                    className={`btn btn-sm flex-1 mr-2 gap-2 ${copiedId === pin.id ? 'btn-success text-white' : 'btn-ghost text-primary'}`}
                  >
                    {copiedId === pin.id ? <Check size={14} /> : <Copy size={14} />}
                    {copiedId === pin.id ? 'Copiado' : 'Copiar'}
                  </button>

                  <button 
                    onClick={() => handleEdit(pin)}
                    className="btn btn-ghost btn-sm btn-square text-base-content/60 hover:text-primary"
                    title="Editar"
                  >
                    <Edit3 size={16} />
                  </button>

                  <button 
                    onClick={() => handleDelete(pin.id)}
                    className="btn btn-ghost btn-sm btn-square text-base-content/60 hover:text-error"
                    title="Eliminar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL (Sirve para Crear y Editar) */}
      {isModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box bg-base-100 border border-base-content/10">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg">{editingId ? 'Editar Pin' : 'Crear Nuevo Pin'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="btn btn-sm btn-circle btn-ghost"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleSavePin} className="flex flex-col gap-4">
              <div className="form-control">
                <label className="label text-xs font-bold opacity-60">TÍTULO DEL PIN</label>
                <input 
                  required
                  type="text" 
                  placeholder="Ej: Punto de encuentro"
                  className="input input-bordered w-full bg-base-200"
                  value={pinForm.title}
                  onChange={(e) => setPinForm({...pinForm, title: e.target.value})}
                />
              </div>

              <div className="form-control">
                <label className="label text-xs font-bold opacity-60">CATEGORÍA</label>
                <select 
                  className="select select-bordered w-full bg-base-200"
                  value={pinForm.category}
                  onChange={(e) => setPinForm({...pinForm, category: e.target.value})}
                >
                  <option value="General">General</option>
                  <option value="Logística">Logística</option>
                  <option value="Tours">Tours</option>
                  <option value="Ventas">Ventas</option>
                </select>
              </div>

              <div className="form-control">
                <label className="label text-xs font-bold opacity-60">CONTENIDO</label>
                <textarea 
                  required
                  rows={6}
                  placeholder="Escribe el mensaje aquí..."
                  className="textarea textarea-bordered bg-base-200 text-sm"
                  value={pinForm.content}
                  onChange={(e) => setPinForm({...pinForm, content: e.target.value})}
                />
              </div>

              <div className="modal-action">
                <button type="submit" disabled={saving} className="btn btn-primary w-full">
                  {saving ? "Procesando..." : (editingId ? "Actualizar" : "Guardar Pin")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
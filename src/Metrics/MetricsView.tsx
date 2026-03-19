import { useState, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import {
  Users, TrendingUp, Calendar, Award,
  Filter, RefreshCw,
} from "lucide-react";
import {
  useMetricsData, groupBy, getMonthKey, getWeekKey, getYearKey,
  PLATFORM_COLORS, PLATFORM_LABELS,
} from "./UseMetricsData";

// ─── TIPOS ────────────────────────────────────────────────────────────────────
type Period = "week" | "month" | "year";

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, icon: Icon, accent }: {
  label:  string;
  value:  string | number;
  sub?:   string;
  icon:   any;
  accent: string;
}) {
  return (
    <div className="bg-base-100 border border-base-content/5 rounded-2xl p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest opacity-40">{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${accent}18` }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-black leading-none text-base-content">{value}</span>
        {sub && <span className="text-xs opacity-40 mb-0.5">{sub}</span>}
      </div>
    </div>
  );
}

// ─── TOOLTIP PERSONALIZADO ────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-base-100 border border-base-content/10 rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="font-bold opacity-60 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function MetricsView() {
  const { tours, loading, error, platforms, dateRange } = useMetricsData();

  const [period,          setPeriod]          = useState<Period>("month");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");

  // ── Filtrar tours por plataforma ────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (selectedPlatform === "all") return tours;
    return tours.filter((t) => (t.platform ?? "other") === selectedPlatform);
  }, [tours, selectedPlatform]);

  // ── Todas las reservas filtradas ────────────────────────────────────────────
  const allReservations = useMemo(
    () => filtered.flatMap((t) => t.reservations ?? []),
    [filtered]
  );

  // ── KPIs globales ───────────────────────────────────────────────────────────
  const totalPax    = allReservations.reduce((a, r) => a + r.pax, 0);
  const totalTours  = filtered.length;
  const avgPax      = totalTours > 0 ? (totalPax / totalTours).toFixed(1) : "0";
  const totalCancel = 0; // placeholder — cuando tengamos tabla de cancelaciones

  // ── Mejor día de la semana ──────────────────────────────────────────────────
  const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const paxByDow = useMemo(() => {
    const acc: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (const t of filtered) {
      const d = new Date(t.date);
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const pax = (t.reservations ?? []).reduce((a, r) => a + r.pax, 0);
      acc[dow] += pax;
    }
    return dayNames.map((name, i) => ({ name, pax: acc[i] }));
  }, [filtered]);
  const bestDay = paxByDow.reduce((a, b) => (a.pax >= b.pax ? a : b), paxByDow[0]);

  // ── Serie temporal por período ──────────────────────────────────────────────
  const timeSeries = useMemo(() => {
    const keyFn = period === "week"
      ? getWeekKey
      : period === "month"
      ? getMonthKey
      : getYearKey;

    const grouped = groupBy(filtered, (t) => keyFn(t.date));
    return Object.entries(grouped)
      .map(([key, ts]) => ({
        key,
        label: period === "week"
          ? `Sem ${key.slice(5)}`
          : period === "month"
          ? new Date(key + "-01").toLocaleDateString("es-ES", { month: "short", year: "2-digit" })
          : key,
        tours: ts.length,
        pax:   ts.flatMap((t) => t.reservations ?? []).reduce((a, r) => a + r.pax, 0),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [filtered, period]);

  // ── Pie: distribución por plataforma ───────────────────────────────────────
  const platformPie = useMemo(() => {
    const grouped = groupBy(tours, (t) => t.platform ?? "other");
    return Object.entries(grouped).map(([plat, ts]) => ({
      name:  PLATFORM_LABELS[plat] ?? plat,
      value: ts.flatMap((t) => t.reservations ?? []).reduce((a, r) => a + r.pax, 0),
      color: PLATFORM_COLORS[plat] ?? "#94a3b8",
    })).filter((p) => p.value > 0);
  }, [tours]);

  // ── Top tours más llenos ────────────────────────────────────────────────────
  const topTours = useMemo(() => {
    return [...filtered]
      .map((t) => ({
        label: `${t.title.slice(0, 28)}… ${t.date}`,
        pax:   (t.reservations ?? []).reduce((a, r) => a + r.pax, 0),
        plat:  t.platform ?? "other",
      }))
      .filter((t) => t.pax > 0)
      .sort((a, b) => b.pax - a.pax)
      .slice(0, 8);
  }, [filtered]);

  // ── Pax por día de la semana ────────────────────────────────────────────────
  const monthSeries = useMemo(() => {
    const grouped = groupBy(filtered, (t) => getMonthKey(t.date));
    return Object.entries(grouped)
      .map(([key, ts]) => {
        const row: Record<string, any> = {
          key,
          label: new Date(key + "-01").toLocaleDateString("es-ES", { month: "short", year: "2-digit" }),
        };
        for (const plat of platforms) {
          row[plat] = ts
            .filter((t) => (t.platform ?? "other") === plat)
            .flatMap((t) => t.reservations ?? [])
            .reduce((a, r) => a + r.pax, 0);
        }
        return row;
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [filtered, platforms]);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 opacity-40">
      <RefreshCw size={20} className="animate-spin" />
      <span className="text-sm font-medium">Cargando métricas...</span>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64">
      <span className="text-error text-sm">Error: {error}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 pb-8">

      {/* ── Header + filtros ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-base-content tracking-tight">Métricas</h1>
          <p className="text-xs opacity-40 mt-0.5">
            Datos desde {dateRange.min} · hasta {dateRange.max}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro plataforma */}
          <div className="flex items-center gap-1.5 bg-base-200 rounded-xl px-2 py-1">
            <Filter size={13} className="opacity-40" />
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="bg-transparent text-xs font-medium outline-none text-base-content"
            >
              <option value="all">Todas las plataformas</option>
              {platforms.map((p) => (
                <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
              ))}
            </select>
          </div>

          {/* Selector de período */}
          <div className="flex bg-base-200 rounded-xl p-1 gap-0.5">
            {(["week", "month", "year"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={[
                  "text-xs font-semibold px-3 py-1.5 rounded-lg transition-all",
                  period === p
                    ? "bg-base-100 text-primary shadow-sm"
                    : "text-base-content/40 hover:text-base-content",
                ].join(" ")}
              >
                {p === "week" ? "Semana" : p === "month" ? "Mes" : "Año"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Pax"     value={totalPax}   sub="personas"      icon={Users}       accent="#ff6b35" />
        <KPICard label="Tours"         value={totalTours} sub="realizados"     icon={Calendar}    accent="#3b82f6" />
        <KPICard label="Media pax/tour" value={avgPax}    sub="personas/tour"  icon={TrendingUp}  accent="#10b981" />
        <KPICard label="Mejor día"     value={bestDay?.name ?? "-"} sub={`${bestDay?.pax ?? 0} pax`} icon={Award} accent="#8b5cf6" />
      </div>

      {/* ── Fila 1: Área temporal + Pie ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Evolución temporal — area chart */}
        <div className="lg:col-span-2 bg-base-100 border border-base-content/5 rounded-2xl p-5">
          <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-4">
            Evolución de pax · por {period === "week" ? "semana" : period === "month" ? "mes" : "año"}
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timeSeries} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradPax" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ff6b35" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ff6b35" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradTours" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.05} />
              <XAxis dataKey="label" tick={{ fontSize: 10, opacity: 0.5 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, opacity: 0.5 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, opacity: 0.6 }} />
              <Area type="monotone" dataKey="pax"   name="Pax"   stroke="#ff6b35" strokeWidth={2} fill="url(#gradPax)"   dot={false} />
              <Area type="monotone" dataKey="tours" name="Tours" stroke="#3b82f6" strokeWidth={2} fill="url(#gradTours)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie por plataforma */}
        <div className="bg-base-100 border border-base-content/5 rounded-2xl p-5">
          <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-4">
            Pax por plataforma
          </h2>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={platformPie}
                cx="50%" cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
                dataKey="value"
              >
                {platformPie.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Leyenda manual */}
          <div className="flex flex-col gap-1.5 mt-2">
            {platformPie.map((p) => (
              <div key={p.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="opacity-60">{p.name}</span>
                </div>
                <span className="font-bold">{p.value} pax</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Fila 2: Barras apiladas por plataforma + Días de semana ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Barras apiladas por plataforma y mes */}
        <div className="bg-base-100 border border-base-content/5 rounded-2xl p-5">
          <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-4">
            Pax mensual por plataforma
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthSeries} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.05} />
              <XAxis dataKey="label" tick={{ fontSize: 10, opacity: 0.5 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, opacity: 0.5 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, opacity: 0.6 }} />
              {platforms.map((plat) => (
                <Bar
                  key={plat}
                  dataKey={plat}
                  name={PLATFORM_LABELS[plat] ?? plat}
                  stackId="a"
                  fill={PLATFORM_COLORS[plat] ?? "#94a3b8"}
                  radius={platforms.indexOf(plat) === platforms.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pax por día de la semana */}
        <div className="bg-base-100 border border-base-content/5 rounded-2xl p-5">
          <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-4">
            Actividad por día de la semana
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={paxByDow} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.05} />
              <XAxis dataKey="name" tick={{ fontSize: 11, opacity: 0.5 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, opacity: 0.5 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="pax" name="Pax" radius={[6, 6, 0, 0]}>
                {paxByDow.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.name === bestDay?.name ? "#ff6b35" : "#3b82f620"}
                    stroke={entry.name === bestDay?.name ? "#ff6b35" : "transparent"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Fila 3: Top tours + Line chart mensual ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top tours más llenos */}
        <div className="bg-base-100 border border-base-content/5 rounded-2xl p-5">
          <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-4">
            Tours con más pax
          </h2>
          <div className="flex flex-col gap-2">
            {topTours.map((t, i) => {
              const max = topTours[0]?.pax ?? 1;
              const pct = Math.round((t.pax / max) * 100);
              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs truncate opacity-60 max-w-[70%]">{t.label}</span>
                    <span className="text-xs font-bold">{t.pax} pax</span>
                  </div>
                  <div className="h-1.5 bg-base-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: PLATFORM_COLORS[t.plat] ?? "#ff6b35",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Line chart — comparativa tours vs pax */}
        <div className="bg-base-100 border border-base-content/5 rounded-2xl p-5">
          <h2 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-4">
            Ratio pax/tour por mes
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={timeSeries.map((t) => ({
                ...t,
                ratio: t.tours > 0 ? parseFloat((t.pax / t.tours).toFixed(1)) : 0,
              }))}
              margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.05} />
              <XAxis dataKey="label" tick={{ fontSize: 10, opacity: 0.5 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, opacity: 0.5 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="ratio"
                name="Pax/Tour"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                dot={{ fill: "#8b5cf6", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
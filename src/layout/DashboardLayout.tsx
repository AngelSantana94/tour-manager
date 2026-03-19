import { useEffect, useState } from "react";
import Navbar       from "./Navigation/Navbar";
import Sidebar      from "./Navigation/Sidebar";
import MobileMenu   from "./Navigation/MobileMenu";
import CalendarView from "../Calendars/CalendarView";
import Consultor    from "./Navigation/Consultor";
import MetricsView  from "../Metrics/MetricsView";
import Pins         from "../pins/Pins";
import GuidesView   from "../guides/GuidesView";
import BillingView  from "../Billing/BillingView";

export type ActiveView = "calendario" | "metricas" | "mensajes" | "guias" | "facturacion";

function DashboardLayout() {
  const [activeView, setActiveView] = useState<ActiveView>("calendario");

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved) {
      document.documentElement.setAttribute("data-theme", saved);
    } else {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    }
  }, []);

  const renderView = () => {
    switch (activeView) {
      case "metricas":    return <MetricsView />;
      case "calendario":  return <CalendarView />;
      case "mensajes":    return <Pins />;
      case "guias":       return <GuidesView />;
      case "facturacion": return <BillingView />;
      default: return (
        <div className="flex flex-col items-center justify-center h-64 gap-2 opacity-20">
          <span className="text-4xl">🚧</span>
          <span className="text-sm font-medium capitalize">{activeView} — próximamente</span>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <div className="drawer lg:drawer-open">
        <input id="my-drawer-4" type="checkbox" className="drawer-toggle" />
        <div className="drawer-content flex flex-col min-h-screen bg-base-100">
          <Navbar />
          <main className="flex-1 p-4 pb-20 lg:pb-4 overflow-auto">
            {renderView()}
          </main>
        </div>
        <Sidebar activeView={activeView} onNavigate={setActiveView} />
      </div>
      <div className="lg:hidden">
        <MobileMenu activeView={activeView} onNavigate={setActiveView} />
      </div>
      <Consultor />
    </div>
  );
}

export default DashboardLayout;
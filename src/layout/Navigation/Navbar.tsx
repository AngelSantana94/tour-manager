import NotificationBell from "../../Notifications/NotifiationBell";
import ProfileMenu from "./ProfilMenu";


function Navbar() {
  

  return (
    <>
      {/* ── DESKTOP — sin cambios ── */}
      <nav className="hidden lg:flex w-full h-16 shrink-0 bg-base-200 border-b border-base-content/5 items-center justify-between px-5">
        {/* Logo */}
        <div className="flex flex-col">
          <span className="text-xl font-bold tracking-tight leading-none">
            <span className="text-primary">Tour</span>
            <span className="text-base-content">Manager</span>
          </span>
          <span className="text-[9px] opacity-30 font-bold uppercase tracking-widest mt-0.5">
            Brujas Edition
          </span>
        </div>

        {/* Derecha */}
        <div className="flex items-center gap-3">
          <NotificationBell />
          <div className="pl-3 border-l border-base-content/10">
            <ProfileMenu side="right" />
          </div>
        </div>
      </nav>

      {/* ── MÓVIL — solo campana y perfil ── */}
      <header className="lg:hidden flex w-full h-14 shrink-0 bg-base-100 border-b border-base-content/5 items-center justify-between px-4 relative z-50">
        <span className="text-base font-black tracking-tight">
          <span className="text-primary">Tour</span>
          <span className="text-base-content">Manager</span>
        </span>
        <div className="flex items-center gap-4">
          <div className="scale-110">
            <NotificationBell />
          </div>
          <ProfileMenu side="right" mobileDropDown="down" />
        </div>
      </header>
    </>
  );
}

export default Navbar;

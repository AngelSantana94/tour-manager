import { Bell } from "lucide-react";
import NotificationBell from "../../Notifications/NotifiationBell";
import ProfileMenu from "./ProfilMenu";

// Logos de plataformas
import guruwalkLogo from "../../assets/platforms-logos/guruwalk.png";
import freetourLogo from "../../assets/platforms-logos/freetour.png";
import turixeLogo from "../../assets/platforms-logos/turixe.png";
import tripadvisorLogo from "../../assets/platforms-logos/tripadvisor.png";

function Navbar() {
  const connections = [
    { name: "GuruWalk", logo: guruwalkLogo },
    { name: "FreeTour", logo: freetourLogo },
    { name: "Turixe", logo: turixeLogo },
    { name: "TripAdvisor", logo: tripadvisorLogo },
  ];

  return (
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
  );
}

export default Navbar;

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-xl border border-base-content/10 bg-base-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 px-3 py-2.5 text-left"
      >
        <span className="text-sm font-bold">{title}</span>
        {open ? (
          <ChevronUp size={15} className="opacity-50" />
        ) : (
          <ChevronDown size={15} className="opacity-50" />
        )}
        <span className="ml-auto rounded-full bg-base-200 px-2 py-0.5 text-[11px] font-semibold opacity-70">
          {count}
        </span>
      </button>

      {open && <div className="flex flex-col gap-2 px-2 pb-2">{children}</div>}
    </section>
  );
}

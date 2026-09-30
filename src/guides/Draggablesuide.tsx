import type { ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";

interface DraggableGuideProps {
  id: string;
  children: ReactNode;
}

export default function DraggableGuide({ id, children }: DraggableGuideProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    isDragging,
  } = useDraggable({
    id,
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id,
  });

  const setNodeRef = (node: HTMLElement | null) => {
    setDraggableRef(node);
    setDroppableRef(node);
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={[
        "relative min-w-0 touch-none",
        "cursor-grab select-none",
        "transition-all duration-150",
        "active:cursor-grabbing",
        isDragging ? "z-50 opacity-30" : "opacity-100",
      ].join(" ")}
    >
      {/* Indicador de posición al pasar por encima */}
      {isOver && !isDragging && (
        <div className="pointer-events-none absolute -left-1.5 top-1/2 z-20 h-[70%] w-[3px] -translate-y-1/2 rounded-full bg-primary" />
      )}

      {children}
    </div>
  );
}

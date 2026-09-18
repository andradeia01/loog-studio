"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  rect: Rect;
  scale: number;
  label: string;
  color?: string;
  active?: boolean;
  onSelect?: () => void;
  onChange: (rect: Rect) => void;
  minSize?: number;
}

type Mode =
  | { kind: "idle" }
  | { kind: "drag"; startX: number; startY: number; startRect: Rect }
  | { kind: "resize"; corner: Corner; startX: number; startY: number; startRect: Rect };

type Corner = "nw" | "ne" | "sw" | "se";

/**
 * Bounding box editável sobre um canvas em unidades REAIS do template
 * (não de pixels do preview). O componente aceita o `scale` para renderizar
 * proporcionalmente e converte deltas do mouse de volta para unidades reais.
 */
export function DraggableBox({
  rect,
  scale,
  label,
  color = "#0047AB",
  active,
  onSelect,
  onChange,
  minSize = 20,
}: Props) {
  const modeRef = useRef<Mode>({ kind: "idle" });

  useEffect(() => {
    function onMove(ev: PointerEvent) {
      const m = modeRef.current;
      if (m.kind === "idle") return;
      ev.preventDefault();
      const dx = (ev.clientX - m.startX) / scale;
      const dy = (ev.clientY - m.startY) / scale;
      if (m.kind === "drag") {
        onChange({ ...m.startRect, x: m.startRect.x + dx, y: m.startRect.y + dy });
      } else {
        onChange(applyResize(m.startRect, m.corner, dx, dy, minSize));
      }
    }
    function onUp() {
      if (modeRef.current.kind !== "idle") modeRef.current = { kind: "idle" };
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scale, minSize, onChange]);

  function startDrag(e: React.PointerEvent) {
    e.stopPropagation();
    onSelect?.();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    modeRef.current = {
      kind: "drag",
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...rect },
    };
  }
  function startResize(corner: Corner, e: React.PointerEvent) {
    e.stopPropagation();
    onSelect?.();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    modeRef.current = {
      kind: "resize",
      corner,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...rect },
    };
  }

  const style: React.CSSProperties = {
    position: "absolute",
    left: rect.x * scale,
    top: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
    borderColor: color,
    boxShadow: active ? `0 0 0 2px ${color}55, 0 0 0 1px ${color} inset` : `0 0 0 1px ${color}`,
    cursor: "move",
  };

  return (
    <div
      className={cn(
        "group select-none rounded-sm border-2 border-dashed",
        active && "z-10",
      )}
      style={style}
      onPointerDown={startDrag}
    >
      <span
        className="absolute -top-6 left-0 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
        style={{ color }}
      >
        {label}
      </span>
      {(["nw", "ne", "sw", "se"] as Corner[]).map((c) => (
        <span
          key={c}
          onPointerDown={(e) => startResize(c, e)}
          className={cn(
            "absolute h-3 w-3 rounded-sm border-2 border-white/90",
            c === "nw" && "-left-1.5 -top-1.5 cursor-nwse-resize",
            c === "ne" && "-right-1.5 -top-1.5 cursor-nesw-resize",
            c === "sw" && "-left-1.5 -bottom-1.5 cursor-nesw-resize",
            c === "se" && "-right-1.5 -bottom-1.5 cursor-nwse-resize",
          )}
          style={{ background: color }}
        />
      ))}
    </div>
  );
}

function applyResize(r: Rect, corner: Corner, dx: number, dy: number, minSize: number): Rect {
  let { x, y, width, height } = r;
  if (corner === "se") {
    width = Math.max(minSize, r.width + dx);
    height = Math.max(minSize, r.height + dy);
  } else if (corner === "ne") {
    width = Math.max(minSize, r.width + dx);
    const newH = Math.max(minSize, r.height - dy);
    y = r.y + (r.height - newH);
    height = newH;
  } else if (corner === "sw") {
    const newW = Math.max(minSize, r.width - dx);
    x = r.x + (r.width - newW);
    width = newW;
    height = Math.max(minSize, r.height + dy);
  } else {
    // nw
    const newW = Math.max(minSize, r.width - dx);
    const newH = Math.max(minSize, r.height - dy);
    x = r.x + (r.width - newW);
    y = r.y + (r.height - newH);
    width = newW;
    height = newH;
  }
  return { x, y, width, height };
}

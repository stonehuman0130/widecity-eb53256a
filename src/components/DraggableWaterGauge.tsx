import { useRef, useCallback } from "react";
import { Droplets } from "lucide-react";

interface DraggableWaterGaugeProps {
  intake: number;
  goal: number;
  onIntakeChange: (value: number) => void;
  size?: number;
  strokeWidth?: number;
}

const DraggableWaterGauge = ({
  intake,
  goal,
  onIntakeChange,
  size = 140,
  strokeWidth = 10,
}: DraggableWaterGaugeProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = goal > 0 ? Math.min(intake / goal, 1) : 0;
  const offset = circumference * (1 - percent);
  const center = size / 2;

  // Angle for the handle: 0% = top (−90°), 100% = top (270°)
  const angle = percent * 360 - 90;
  const rad = (angle * Math.PI) / 180;
  const handleX = center + radius * Math.cos(rad);
  const handleY = center + radius * Math.sin(rad);

  const angleToValue = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      // atan2 gives angle from positive x-axis; we want 0 at top
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      if (deg < 0) deg += 360;
      const pct = Math.max(0, Math.min(deg / 360, 1));
      const raw = pct * goal;
      // Snap to 0.1
      const snapped = Math.round(raw * 10) / 10;
      onIntakeChange(Math.max(0, Math.min(snapped, goal)));
    },
    [goal, onIntakeChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      (e.target as Element).setPointerCapture(e.pointerId);
      angleToValue(e.clientX, e.clientY);
    },
    [angleToValue],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      angleToValue(e.clientX, e.clientY);
    },
    [angleToValue],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      className="relative mb-3 select-none"
      style={{ width: size, height: size, touchAction: "none" }}
    >
      <svg
        ref={svgRef}
        width={size}
        height={size}
        className="cursor-pointer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          className="stroke-secondary"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          className="stroke-primary"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: dragging.current ? "none" : "stroke-dashoffset 0.3s ease" }}
        />
        {/* Draggable handle */}
        <circle
          cx={handleX}
          cy={handleY}
          r={strokeWidth * 0.9}
          className="fill-primary"
          stroke="hsl(var(--card))"
          strokeWidth={2.5}
          style={{
            filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.2))",
            cursor: "grab",
          }}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <Droplets size={14} className="text-primary mb-0.5" />
        <span className="text-xl font-bold tracking-display leading-tight">
          {intake.toFixed(1)}L
        </span>
        <span className="text-[10px] text-muted-foreground">/ {goal}L</span>
        {intake >= goal && <span className="text-xs mt-0.5">🎉</span>}
      </div>
    </div>
  );
};

export default DraggableWaterGauge;

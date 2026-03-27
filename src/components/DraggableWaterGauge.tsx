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

  const handleR = strokeWidth * 0.9;
  // Add padding so handle isn't clipped at edges
  const pad = handleR + 3;
  const viewBox = size + pad * 2;
  const center = viewBox / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = goal > 0 ? Math.min(intake / goal, 1) : 0;
  const offset = circumference * (1 - percent);

  // Handle at end of arc: 0% at 12 o'clock
  const angleDeg = percent * 360 - 90;
  const angleRad = (angleDeg * Math.PI) / 180;
  const hx = center + radius * Math.cos(angleRad);
  const hy = center + radius * Math.sin(angleRad);

  const angleToValue = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      if (deg < 0) deg += 360;
      const pct = Math.max(0, Math.min(deg / 360, 1));
      const snapped = Math.round(pct * goal * 10) / 10;
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
      className="relative select-none"
      style={{ width: size, height: size, touchAction: "none" }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewBox} ${viewBox}`}
        width={size}
        height={size}
        className="cursor-pointer overflow-visible"
        style={{ overflow: "visible" }}
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
          stroke="hsl(var(--secondary))"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{
            transition: dragging.current ? "none" : "stroke-dashoffset 0.35s cubic-bezier(.4,0,.2,1)",
            willChange: "stroke-dashoffset",
          }}
        />
        {/* Handle */}
        <circle
          cx={hx}
          cy={hy}
          r={handleR}
          fill="hsl(var(--primary))"
          stroke="hsl(var(--card))"
          strokeWidth={2.5}
          style={{ cursor: "grab" }}
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

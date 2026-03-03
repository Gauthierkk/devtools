import type { TestStatus } from "../store";

// ─── Gauge math ──────────────────────────────────────────────────────────────
// 300° arc, going clockwise from -150° (7 o'clock) to 150° (5 o'clock).
// Convention: angle 0° = 12 o'clock, clockwise positive.

const CX = 50;
const CY = 54;
const R = 38;
const START_ANGLE = -150;
const END_ANGLE = 150;
const ARC_DEGREES = 300;
// Full arc length: (300/360) * 2π * R
const ARC_LENGTH = (ARC_DEGREES / 360) * 2 * Math.PI * R; // ≈ 199

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function buildArcPath(startDeg: number, endDeg: number, clockwise: boolean) {
  const s = polarToCartesian(CX, CY, R, startDeg);
  const e = polarToCartesian(CX, CY, R, endDeg);
  const span = clockwise
    ? ((endDeg - startDeg) + 360) % 360
    : ((startDeg - endDeg) + 360) % 360;
  const largeArc = span > 180 ? 1 : 0;
  const sweep = clockwise ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 ${largeArc} ${sweep} ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

const BACKGROUND_ARC = buildArcPath(START_ANGLE, END_ANGLE, true);

// ─── Gauge SVG ────────────────────────────────────────────────────────────────
interface GaugeProps {
  percentage: number; // 0–1
  color: string;
  status: TestStatus;
}

function Gauge({ percentage, color, status }: GaugeProps) {
  const clampedPct = Math.min(Math.max(percentage, 0), 1);
  // dashoffset: ARC_LENGTH when 0%, 0 when 100%
  const dashOffset = ARC_LENGTH * (1 - clampedPct);
  const isRunning = status === "running";

  return (
    <svg viewBox="0 0 100 88" aria-hidden="true" className="w-full">
      {/* Track */}
      <path
        d={BACKGROUND_ARC}
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        className="text-bg-surface-hover"
      />
      {/* Value fill */}
      <path
        d={BACKGROUND_ARC}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${ARC_LENGTH}`}
        strokeDashoffset={isRunning ? ARC_LENGTH * 0.85 : dashOffset}
        style={{ transition: isRunning ? "none" : "stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)" }}
        className={isRunning ? "animate-pulse" : ""}
      />
      {/* Tick marks */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const tickAngle = START_ANGLE + t * ARC_DEGREES;
        const inner = polarToCartesian(CX, CY, R - 10, tickAngle);
        const outer = polarToCartesian(CX, CY, R + 2, tickAngle);
        return (
          <line
            key={t}
            x1={inner.x.toFixed(2)}
            y1={inner.y.toFixed(2)}
            x2={outer.x.toFixed(2)}
            y2={outer.y.toFixed(2)}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="text-bg-surface-active"
          />
        );
      })}
    </svg>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────
export interface MetricCardProps {
  label: string;
  icon: React.ReactNode;
  value: number | null;
  unit: string;
  subtitle: string | null;
  status: TestStatus;
  error: string | null;
  maxValue: number;
  color: string;
}

export default function MetricCard({
  label,
  icon,
  value,
  unit,
  subtitle,
  status,
  error,
  maxValue,
  color,
}: MetricCardProps) {
  const percentage = value != null ? value / maxValue : 0;

  return (
    <div className="flex flex-col rounded-xl border border-border-default bg-bg-surface p-4">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-text-tertiary">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          {label}
        </span>
        {status === "running" && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        )}
        {status === "done" && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        )}
      </div>

      {/* Gauge */}
      <div className="relative px-4">
        <Gauge percentage={percentage} color={color} status={status} />
        {/* Center overlay */}
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-3"
          style={{ top: "30%" }}
        >
          {status === "idle" && (
            <span className="text-lg font-semibold text-text-tertiary">—</span>
          )}
          {status === "running" && (
            <span className="text-sm font-medium text-text-tertiary animate-pulse">Testing…</span>
          )}
          {status === "done" && value != null && (
            <>
              <span className="text-2xl font-bold leading-none text-text-primary">
                {value >= 1000 ? (value / 1000).toFixed(1) : value % 1 === 0 ? value : value.toFixed(1)}
              </span>
              <span className="mt-0.5 text-xs text-text-secondary">
                {value >= 1000 ? unit.replace(/^[A-Za-z]+/, (m) => `G${m.slice(1)}`) : unit}
              </span>
            </>
          )}
          {status === "error" && (
            <span className="text-xs text-danger text-center leading-tight px-1">Error</span>
          )}
        </div>
      </div>

      {/* Subtitle / error */}
      <div className="mt-2 min-h-[1rem] text-center">
        {status === "done" && subtitle && (
          <p className="text-xs text-text-tertiary">{subtitle}</p>
        )}
        {status === "error" && error && (
          <p className="text-xs text-danger leading-snug">{error}</p>
        )}
      </div>
    </div>
  );
}

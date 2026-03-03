import type { TestStatus } from "../store";

// ─── Log-like scale ───────────────────────────────────────────────────────────
// Evenly-spaced positions on the arc correspond to these Mbps values.
const SPEED_SCALE = [0, 10, 25, 100, 250, 500];

function speedToPercent(speed: number): number {
  const n = SPEED_SCALE.length - 1;
  if (speed <= SPEED_SCALE[0]) return 0;
  if (speed >= SPEED_SCALE[n]) return 1;
  for (let i = 0; i < n; i++) {
    if (speed <= SPEED_SCALE[i + 1]) {
      return (i + (speed - SPEED_SCALE[i]) / (SPEED_SCALE[i + 1] - SPEED_SCALE[i])) / n;
    }
  }
  return 1;
}

// ─── Gauge math ───────────────────────────────────────────────────────────────
const CX = 50;
const CY = 52;
const R = 36;
const START_ANGLE = -150;
const ARC_DEGREES = 300;
const END_ANGLE = START_ANGLE + ARC_DEGREES;
const ARC_LENGTH = (ARC_DEGREES / 360) * 2 * Math.PI * R;

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
}

function Gauge({ percentage, color }: GaugeProps) {
  const clampedPct = Math.min(Math.max(percentage, 0), 1);
  const dashOffset = ARC_LENGTH * (1 - clampedPct);

  return (
    // Expanded viewBox: 8px extra on each side, 2px top, 14px bottom for labels
    <svg viewBox="-8 -2 116 106" aria-hidden="true" className="w-full">
      {/* Track */}
      <path
        d={BACKGROUND_ARC}
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        className="text-bg-surface-hover"
      />

      {/* Scale ticks + labels — drawn before arc so arc paints over the ticks */}
      {SPEED_SCALE.map((val, i) => {
        const t = i / (SPEED_SCALE.length - 1);
        const angle = START_ANGLE + t * ARC_DEGREES;
        const inner = polarToCartesian(CX, CY, R - 10, angle);
        const outer = polarToCartesian(CX, CY, R + 3, angle);
        const labelPos = polarToCartesian(CX, CY, R + 16, angle);
        return (
          <g key={val}>
            <line
              x1={inner.x.toFixed(2)} y1={inner.y.toFixed(2)}
              x2={outer.x.toFixed(2)} y2={outer.y.toFixed(2)}
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              className="text-bg-surface-active"
            />
            <text
              x={labelPos.x.toFixed(2)} y={labelPos.y.toFixed(2)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="5.5" fill="currentColor"
              className="text-text-tertiary"
            >
              {val}
            </text>
          </g>
        );
      })}

      {/* Value fill — rendered last so it paints over the tick lines */}
      <path
        d={BACKGROUND_ARC}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${ARC_LENGTH}`}
        strokeDashoffset={dashOffset}
        style={{ transition: "stroke-dashoffset 0.4s cubic-bezier(0.4,0,0.2,1)" }}
      />
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
  color,
}: MetricCardProps) {
  const percentage = value != null ? speedToPercent(value) : 0;

  const displayValue = value == null ? null
    : value >= 1000 ? (value / 1000).toFixed(1)
    : value >= 100 ? Math.round(value).toString()
    : value.toFixed(1);
  const displayUnit = value != null && value >= 1000
    ? unit.replace(/^[A-Za-z]+/, (m) => `G${m.slice(1)}`)
    : unit;

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
        <Gauge percentage={percentage} color={color} />
        {/* Center overlay */}
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-4"
          style={{ top: "30%" }}
        >
          {status === "idle" && (
            <span className="text-lg font-semibold text-text-tertiary">—</span>
          )}
          {status === "running" && displayValue == null && (
            <span className="text-sm font-medium text-text-tertiary animate-pulse">Testing…</span>
          )}
          {(status === "running" || status === "done") && displayValue != null && (
            <>
              <span className={`text-2xl font-bold leading-none text-text-primary${status === "running" ? " animate-pulse" : ""}`}>
                {displayValue}
              </span>
              <span className="mt-0.5 text-xs text-text-secondary">{displayUnit}</span>
            </>
          )}
          {status === "error" && (
            <span className="text-xs text-danger text-center leading-tight px-1">Error</span>
          )}
        </div>
      </div>

      {/* Subtitle / error */}
      <div className="mt-2 min-h-[1rem] text-center">
        {(status === "running" || status === "done") && subtitle && (
          <p className="text-xs text-text-tertiary">{subtitle}</p>
        )}
        {status === "error" && error && (
          <p className="text-xs text-danger leading-snug">{error}</p>
        )}
      </div>
    </div>
  );
}

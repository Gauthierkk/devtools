import { useEffect, useRef } from "react";

interface AreaChartProps {
  data: number[];
  maxPoints?: number;
  color: string;
  secondaryData?: number[];
  secondaryColor?: string;
  label: string;
  secondaryLabel?: string;
  unit?: string;
  height?: number;
  formatValue?: (v: number) => string;
  pollMs?: number;
}

function autoFormat(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} GB`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} MB`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)} KB`;
  return `${Math.round(v)} B`;
}

export default function AreaChart({
  data,
  maxPoints = 240,
  color,
  secondaryData,
  secondaryColor,
  label,
  secondaryLabel,
  unit = "/s",
  height = 180,
  formatValue,
  pollMs = 500,
}: AreaChartProps) {
  const gRef = useRef<SVGGElement>(null);
  const animRef = useRef(0);
  const fmt = formatValue ?? autoFormat;

  // Render maxPoints + 1: the extra point sits just past the right edge
  // and scrolls into view as the <g> translates left
  const renderCount = maxPoints + 1;
  const padded = padArray(data, renderCount);
  const secondaryPadded = secondaryData
    ? padArray(secondaryData, renderCount)
    : null;

  const allValues = secondaryPadded
    ? [...padded, ...secondaryPadded]
    : padded;
  const maxVal = Math.max(...allValues, 1);

  const W = 100;
  const H = 100;
  const PAD_TOP = 4;
  const PAD_BOTTOM = 2;
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  // Step between points: maxPoints intervals span the viewBox width
  const step = W / maxPoints;

  // Smooth scroll animation: translate <g> from 0 to -step over pollMs
  // Restarts each time new data arrives (data.length changes)
  const dataLen = data.length;
  useEffect(() => {
    const g = gRef.current;
    if (!g || dataLen < 2) return;

    const startTime = performance.now();

    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / pollMs, 1);
      g.setAttribute("transform", `translate(${-progress * step}, 0)`);
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    g.setAttribute("transform", "translate(0, 0)");
    animRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animRef.current);
  }, [dataLen, pollMs, step]);

  const toPoints = (arr: number[]) =>
    arr.map((v, i) => ({
      x: i * step,
      y: PAD_TOP + chartH - (v / maxVal) * chartH,
    }));

  const toPath = (arr: number[], fill: boolean) => {
    const pts = toPoints(arr);
    if (pts.length < 2) return "";

    const d: string[] = [`M${pts[0].x},${pts[0].y}`];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];
      const tension = 0.35;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;
      d.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`);
    }

    if (fill) {
      const lastX = pts[pts.length - 1].x;
      return `${d.join(" ")} L${lastX},${H} L${pts[0].x},${H} Z`;
    }
    return d.join(" ");
  };

  const currentPrimary = data.length > 0 ? data[data.length - 1] : 0;
  const currentSecondary =
    secondaryData && secondaryData.length > 0
      ? secondaryData[secondaryData.length - 1]
      : 0;

  const gridLines = [0.25, 0.5, 0.75, 1].map((frac) => ({
    pct: ((PAD_TOP + chartH - frac * chartH) / H) * 100,
    label: fmt(frac * maxVal),
  }));

  return (
    <div className="rounded-xl border border-border-default bg-bg-surface p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs font-medium text-text-secondary">
              {label}
            </span>
          </div>
          {secondaryLabel && secondaryColor && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: secondaryColor }}
              />
              <span className="text-xs font-medium text-text-secondary">
                {secondaryLabel}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold" style={{ color }}>
            {fmt(currentPrimary)}
            {unit}
          </span>
          {secondaryLabel && secondaryColor && (
            <span
              className="text-sm font-semibold"
              style={{ color: secondaryColor }}
            >
              {fmt(currentSecondary)}
              {unit}
            </span>
          )}
        </div>
      </div>

      {/* Chart container */}
      <div className="relative" style={{ height }}>
        {/* Grid labels — HTML so they don't warp or scroll */}
        {gridLines.map((g) => (
          <span
            key={g.pct}
            className="pointer-events-none absolute left-1 text-text-tertiary"
            style={{
              top: `${g.pct}%`,
              fontSize: 10,
              lineHeight: 1,
            }}
          >
            {g.label}
          </span>
        ))}

        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-hidden"
        >
          {/* Grid lines (fixed — don't scroll) */}
          {gridLines.map((g) => (
            <line
              key={g.pct}
              x1={0}
              y1={(g.pct / 100) * H}
              x2={W}
              y2={(g.pct / 100) * H}
              stroke="var(--border-default)"
              strokeWidth={0.3}
            />
          ))}

          {/* Chart paths — wrapped in <g> that scrolls smoothly */}
          <g ref={gRef}>
            {secondaryPadded && secondaryColor && (
              <>
                <path
                  d={toPath(secondaryPadded, true)}
                  fill={secondaryColor}
                  opacity={0.1}
                />
                <path
                  d={toPath(secondaryPadded, false)}
                  fill="none"
                  stroke={secondaryColor}
                  strokeWidth={0.4}
                  opacity={0.8}
                />
              </>
            )}
            <path d={toPath(padded, true)} fill={color} opacity={0.15} />
            <path
              d={toPath(padded, false)}
              fill="none"
              stroke={color}
              strokeWidth={0.4}
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function padArray(arr: number[], len: number): number[] {
  if (arr.length >= len) return arr.slice(-len);
  return [...Array<number>(len - arr.length).fill(0), ...arr];
}

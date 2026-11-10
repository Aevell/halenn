"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function Panel({
  title,
  description,
  children,
  wide = false,
  action,
  basis,
  when = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  action?: ReactNode;
  basis?: string;
  when?: boolean;
}) {
  const id = useId();
  if (!when) return null;
  return (
    <section
      className={"ha-panel" + (wide ? " ha-wide" : "")}
      aria-labelledby={id}
    >
      <header className="ha-panel-head">
        <div>
          {basis && <span className="ha-basis">{basis}</span>}
          <h2 id={id}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export function Empty({
  title = "No records for this period",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="ha-empty">
      <span className="ha-empty-mark" aria-hidden="true">
        —
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
  previous,
  onClick,
}: {
  label: string;
  value: string | number;
  detail?: string;
  previous?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="ha-stat-label">{label}</span>
      <strong>{value}</strong>
      <span className="ha-stat-detail">{previous || detail || "\u00a0"}</span>
      {previous && detail && <small>{detail}</small>}
    </>
  );
  return onClick ? (
    <button className="ha-stat" onClick={onClick}>
      {inner}
      <span className="ha-stat-arrow" aria-hidden="true">
        ↗
      </span>
    </button>
  ) : (
    <div className="ha-stat">{inner}</div>
  );
}
export type BarRow = {
  label: string;
  value: number;
  detail?: string;
  onClick?: () => void;
};
export function Bars({
  rows,
  max,
  format = String,
  empty,
  compact = false,
}: {
  rows: BarRow[];
  max?: number;
  format?: (n: number) => string;
  empty?: string;
  compact?: boolean;
}) {
  const ceiling = Math.max(1, max ?? Math.max(...rows.map((r) => r.value)));
  if (!rows.length)
    return (
      <Empty>
        {empty || "Records will appear here as you use the workspace."}
      </Empty>
    );
  return (
    <div className={"ha-bars" + (compact ? " ha-bars-compact" : "")}>
      {rows.map((row, i) => {
        const content = (
          <>
            <span className="ha-bar-title">
              <span>{row.label}</span>
              <b>
                {format(row.value)}
                {row.onClick && <span aria-hidden="true"> ↗</span>}
              </b>
            </span>
            <span className="ha-bar-track" aria-hidden="true">
              <span
                style={{
                  width:
                    Math.max(0, Math.min(100, (row.value / ceiling) * 100)) +
                    "%",
                }}
              />
            </span>
            {row.detail && <small>{row.detail}</small>}
          </>
        );
        return row.onClick ? (
          <button
            className="ha-bar-row"
            onClick={row.onClick}
            key={row.label + i}
          >
            {content}
          </button>
        ) : (
          <div className="ha-bar-row" key={row.label + i}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
type PlotRow = {
  label: string;
  fullLabel: string;
  a: number;
  b?: number;
  onClick?: () => void;
};
type PlotProps = {
  rows: PlotRow[];
  labels: [string, string?];
  format?: (v: number) => string;
  empty?: string;
  compact?: boolean;
  showZero?: boolean;
  wholeNumbers?: boolean;
};
export function Trend(props: PlotProps) {
  return <TimePlot {...props} />;
}
export function Columns(props: PlotProps) {
  return <TimePlot {...props} columns />;
}
function TimePlot({
  rows,
  labels,
  format = String,
  empty,
  compact = false,
  showZero = false,
  wholeNumbers = false,
  columns = false,
}: PlotProps & { columns?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [selected, setSelected] = useState<number | null>(null);
  const id = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(180, entries[0].contentRect.width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const height = compact ? 172 : 238,
    left = 48,
    right = 14,
    top = 18,
    bottom = 36;
  const values = rows.flatMap((r) => (r.b === undefined ? [r.a] : [r.a, r.b]));
  const lo = Math.min(0, ...values),
    rawHi = Math.max(lo === 0 ? 1 : 0, ...values),
    hi = wholeNumbers ? Math.ceil(rawHi / 2) * 2 : rawHi,
    range = hi - lo;
  const plotWidth = width - left - right;
  const slot = plotWidth / Math.max(1, rows.length);
  const barWidth = Math.min(28, slot * 0.3);
  const barGap = Math.min(5, slot * 0.08);
  const x = (i: number) => left + (columns
    ? slot * (i + 0.5)
    : plotWidth * (rows.length === 1 ? 0.5 : i / Math.max(1, rows.length - 1)));
  const y = (v: number) =>
    top + (height - top - bottom) * (1 - (v - lo) / range);
  const path = (key: "a" | "b") =>
    rows.map((r, i) => `${i ? "L" : "M"}${x(i)},${y(r[key] ?? 0)}`).join(" ");
  const active = selected === null ? undefined : rows[selected];
  const ticks = Math.min(rows.length, Math.max(2, Math.min(5, Math.floor(plotWidth / 90) + 1)));
  const tickIndexes = new Set(Array.from({ length: ticks }, (_, i) =>
    Math.round(i * (rows.length - 1) / Math.max(1, ticks - 1))));
  const gridValues = (lo < 0 && hi > 0 ? [lo, 0, hi] : [lo, lo + range / 2, hi])
    .filter((value) => value === 0 || Math.abs(y(value) - y(0)) >= 18);
  return (
    <div ref={ref} className={"ha-trend" + (columns ? " ha-columns" : "")}>
      <div className="ha-legend">
        <span>
          <i />
          {labels[0]}
        </span>
        {labels[1] && (
          <span>
            <i className="ha-secondary" />
            {labels[1]}
          </span>
        )}
      </div>
      {!rows.length || (!showZero && !values.some(Boolean)) ? (
        <Empty title="A clear view starts with your first records">
          {empty || "No activity was recorded in this period."}
        </Empty>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-labelledby={id}
            onPointerMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              const at = ((e.clientX - box.left) * width) / box.width;
              setSelected(
                Math.max(
                  0,
                  Math.min(
                    rows.length - 1,
                    columns ? Math.floor((at - left) / slot) : Math.round(
                      ((at - left) / plotWidth) * (rows.length - 1)),
                  ),
                ),
              );
            }}
            onPointerLeave={() => setSelected(null)}
          >
            <title id={id}>
              {labels.filter(Boolean).join(" and ") +
                " over the selected period. Exact values are in the data table below."}
            </title>
            {gridValues.map((value) => {
              return (
                <g key={value}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={y(value)}
                    y2={y(value)}
                    className="ha-gridline"
                  />
                  <text x={left - 10} y={y(value) + 4} textAnchor="end">
                    {new Intl.NumberFormat("en-GB", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(value)}
                  </text>
                </g>
              );
            })}
            {columns ? rows.map((row, i) => (
              <g key={i}>
                {(["a", ...(labels[1] ? ["b"] : [])] as ("a" | "b")[]).map((key) => {
                  const value = row[key] ?? 0;
                  return <rect key={key}
                    x={x(i) + (labels[1] ? key === "a" ? -barGap / 2 - barWidth : barGap / 2 : -barWidth / 2)}
                    y={Math.min(y(0), y(value))}
                    width={barWidth} height={Math.abs(y(value) - y(0))}
                    className={key === "a" ? "ha-column" : "ha-column ha-column-secondary"}
                    opacity={active && selected !== i ? 0.55 : 1}
                  />;
                })}
              </g>
            )) : <>
              <path d={path("a")} className="ha-line" />
              {labels[1] && <path d={path("b")} className="ha-line ha-line-secondary" />}
            </>}
            {lo < 0 && <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="ha-zero-line" />}
            {rows
              .filter((_, i) => tickIndexes.has(i))
              .map((row) => {
                const i = rows.indexOf(row);
                return (
                  <text
                    key={i}
                    x={x(i)}
                    y={height - 9}
                    textAnchor={
                      i === 0
                        ? "start"
                        : i === rows.length - 1
                          ? "end"
                          : "middle"
                    }
                  >
                    {row.label}
                  </text>
                );
              })}
            {!columns && rows.length === 1 && (
              <circle cx={x(0)} cy={y(rows[0].a)} r="4" className="ha-point" />
            )}
            {active && (
              <g>
                <line
                  x1={x(selected!)}
                  x2={x(selected!)}
                  y1={top}
                  y2={height - bottom}
                  className="ha-hoverline"
                />
                {!columns && <circle
                  cx={x(selected!)}
                  cy={y(active.a)}
                  r="4"
                  className="ha-point"
                />}
              </g>
            )}
          </svg>
          <div className="ha-chart-readout">
            {active
              ? `${active.fullLabel} · ${labels[0]} ${format(active.a)}${labels[1] ? ` · ${labels[1]} ${format(active.b ?? 0)}` : ""}`
              : "Move across the chart, or open the exact values below."}
          </div>
        </>
      )}
      <details className="ha-details">
        <summary>View exact values</summary>
        <div className="ha-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>{labels[0]}</th>
                {labels[1] && <th>{labels[1]}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <th>
                    {row.onClick ? (
                      <button className="ha-text-button" onClick={row.onClick}>
                        {row.fullLabel} ↗
                      </button>
                    ) : (
                      row.fullLabel
                    )}
                  </th>
                  <td>{format(row.a)}</td>
                  {labels[1] && <td>{format(row.b ?? 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

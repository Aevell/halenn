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
export function Trend({
  rows,
  labels,
  format = String,
  empty,
}: {
  rows: PlotRow[];
  labels: [string, string?];
  format?: (v: number) => string;
  empty?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [selected, setSelected] = useState<number | null>(null);
  const id = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(240, entries[0].contentRect.width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const height = 238,
    left = 48,
    right = 14,
    top = 18,
    bottom = 36;
  const values = rows.flatMap((r) => (r.b === undefined ? [r.a] : [r.a, r.b]));
  const lo = Math.min(0, ...values),
    hi = Math.max(1, ...values),
    range = hi - lo;
  const x = (i: number) =>
    left +
    (width - left - right) *
      (rows.length === 1 ? 0.5 : i / Math.max(1, rows.length - 1));
  const y = (v: number) =>
    top + (height - top - bottom) * (1 - (v - lo) / range);
  const path = (key: "a" | "b") =>
    rows.map((r, i) => `${i ? "L" : "M"}${x(i)},${y(r[key] ?? 0)}`).join(" ");
  const active = selected === null ? undefined : rows[selected];
  const ticks = width < 440 ? 3 : 5;
  return (
    <div ref={ref} className="ha-trend">
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
      {!values.some(Boolean) ? (
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
                    Math.round(
                      ((at - left) / (width - left - right)) *
                        (rows.length - 1),
                    ),
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
            {[0, 0.5, 1].map((t) => {
              const value = lo + range * t;
              return (
                <g key={t}>
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
            <path d={path("a")} className="ha-line" />
            {labels[1] && (
              <path d={path("b")} className="ha-line ha-line-secondary" />
            )}
            {rows
              .filter(
                (_, i) =>
                  i === 0 ||
                  i === rows.length - 1 ||
                  i % Math.max(1, Math.ceil(rows.length / ticks)) === 0,
              )
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
            {rows.length === 1 && (
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
                <circle
                  cx={x(selected!)}
                  cy={y(active.a)}
                  r="4"
                  className="ha-point"
                />
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

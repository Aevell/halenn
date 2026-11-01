"use client";

import { createContext, useContext, type ReactNode } from "react";
import { maxExtraPages, money, pagePrice, type Selection } from "./catalog";
import { actionAvailable, actionSelected, type EstimateAction } from "./estimate-selection";
import s from "./pricing.module.css";

const Context = createContext<{ selection: Selection; onAction: (action: EstimateAction, label: string) => void } | null>(null);
export function EstimateProvider({ selection, onAction, children }: {
  selection: Selection; onAction: (action: EstimateAction, label: string) => void; children: ReactNode;
}) {
  return <Context.Provider value={{ selection, onAction }}>{children}</Context.Provider>;
}
function useEstimate() {
  const value = useContext(Context);
  if (!value) throw new Error("Estimate controls require EstimateProvider");
  return value;
}
export function EstimateToggle({ action, label }: { action: EstimateAction; label: string }) {
  const { selection, onAction } = useEstimate();
  const selected = actionSelected(selection, action);
  return <button type="button" className={s.addEstimate} data-pricing-interactive aria-pressed={selected}
    aria-label={`${selected ? "Remove" : "Add"} ${label} ${selected ? "from" : "to"} estimate`}
    disabled={!actionAvailable(selection, action)} onClick={() => onAction(action, label)}>
    <span aria-hidden="true">{selected ? "✓" : "+"}</span>{selected ? "Added · Remove" : "Add to estimate"}
  </button>;
}
export function EstimateRequirement({ service }: { service: "web" | "app" }) {
  const { selection } = useEstimate();
  return selection.services.includes(service) ? null : <p className={s.requirement} data-pricing-interactive>
    {service === "web" ? "To include extras, care or visibility packages in your estimate, add a website or webshop above." : "Add an app platform above to include App Care in your estimate."}
  </p>;
}
export function ExtraPages() {
  const { selection, onAction } = useEstimate();
  const enabled = selection.services.includes("web");
  return <div className={s.pageQuantity}>
    <div><label htmlFor="extra-pages">Extra pages</label><p>{money(pagePrice)} per page, beyond the five included.</p></div>
    <div className={s.quantityControls} data-pricing-interactive>
      <button aria-label="Remove an extra page" disabled={!enabled || selection.extraPages === 0} onClick={() => onAction({kind:"pages",count:selection.extraPages - 1}, "Extra pages")}>−</button>
      <input id="extra-pages" aria-label="Number of extra pages" type="number" min={0} max={maxExtraPages} step={1} disabled={!enabled} value={selection.extraPages}
        onChange={event => onAction({kind:"pages",count:Number(event.target.value)}, "Extra pages")} />
      <button aria-label="Add an extra page" disabled={!enabled || selection.extraPages === maxExtraPages} onClick={() => onAction({kind:"pages",count:selection.extraPages + 1}, "Extra pages")}>+</button>
    </div>
    {selection.extraPages > 0 && <span className={s.pageSubtotal}>{money(selection.extraPages * pagePrice)}</span>}
  </div>;
}

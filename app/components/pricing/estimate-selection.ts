import {
  defaultSelection, normalizeSelection, parseSelection, maxExtraPages,
  type Selection, type WebType, type AppPlatformId, type ExtraId,
  type CareId, type VisibilityId, type AutomationPackageId, type EstimateLine,
} from "./catalog";

export type EstimateAction =
  | { kind: "web"; id: WebType }
  | { kind: "app"; id: AppPlatformId }
  | { kind: "extra"; id: ExtraId }
  | { kind: "care"; id: Exclude<CareId, "none"> }
  | { kind: "visibility"; id: VisibilityId }
  | { kind: "automation"; id: AutomationPackageId }
  | { kind: "appCare" }
  | { kind: "customAutomation" }
  | { kind: "pages"; count: number };

export const emptySelection = (): Selection => normalizeSelection({ ...defaultSelection, services: [] });

// Preserve existing shared links; a fresh visit starts with no products selected.
export function parseBrowsingSelection(query: Record<string, string | string[] | undefined>) {
  const keys = ["services", "project", "web", "extras", "pages", "visibility", "packages", "automation", "customAutomation", "care", "platform", "appCare"];
  return keys.some(key => query[key] !== undefined) ? parseSelection(query) : emptySelection();
}

export function actionAvailable(selection: Selection, action: EstimateAction) {
  if (["extra", "care", "visibility", "pages"].includes(action.kind)) return selection.services.includes("web");
  if (action.kind === "appCare") return selection.services.includes("app");
  return true;
}

export function actionSelected(s: Selection, action: EstimateAction): boolean {
  switch (action.kind) {
    case "web": return s.services.includes("web") && s.webType === action.id;
    case "app": return s.services.includes("app") && s.appPlatform === action.id;
    case "extra": return s.extras.includes(action.id);
    case "care": return s.care === action.id;
    case "visibility": return s.visibility.includes(action.id);
    case "automation": return s.automationPackages.includes(action.id);
    case "appCare": return s.appCare === "app";
    case "customAutomation": return s.customAutomation;
    case "pages": return s.extraPages === action.count;
  }
}

const toggle = <T,>(items: T[], item: T) => items.includes(item) ? items.filter(value => value !== item) : [...items, item];

export function applyEstimateAction(value: Selection, action: EstimateAction): Selection {
  const s = normalizeSelection(value);
  if (!actionAvailable(s, action)) return s;
  const selected = actionSelected(s, action);
  switch (action.kind) {
    case "web":
      return normalizeSelection({ ...s, services: selected ? s.services.filter(id => id !== "web") : [...s.services, "web"], webType: action.id });
    case "app":
      return normalizeSelection({ ...s, services: selected ? s.services.filter(id => id !== "app") : [...s.services, "app"], appPlatform: action.id });
    case "extra": return normalizeSelection({ ...s, extras: toggle(s.extras, action.id) });
    case "care": return normalizeSelection({ ...s, care: selected ? "none" : action.id });
    case "visibility": return normalizeSelection({ ...s, visibility: toggle(s.visibility, action.id) });
    case "appCare": return normalizeSelection({ ...s, appCare: selected ? "none" : "app" });
    case "pages":
      if (!Number.isInteger(action.count) || action.count < 0 || action.count > maxExtraPages) return s;
      return normalizeSelection({ ...s, extraPages: action.count });
    case "automation":
    case "customAutomation": {
      const packages = action.kind === "automation" ? toggle(s.automationPackages, action.id) : s.automationPackages;
      const custom = action.kind === "customAutomation" ? !s.customAutomation : s.customAutomation;
      return normalizeSelection({ ...s, automationPackages: packages, customAutomation: custom,
        services: packages.length || custom ? [...s.services, "automation"] : s.services.filter(id => id !== "automation") });
    }
  }
}

export function removeEstimateLine(value: Selection, line: Pick<EstimateLine, "id" | "service">): Selection {
  const s = normalizeSelection(value);
  if (line.id === "website" || line.id === "webshop") return normalizeSelection({ ...s, services: s.services.filter(id => id !== "web") });
  if (line.id === "app-care") return { ...s, appCare: "none" };
  if (line.service === "app") return normalizeSelection({ ...s, services: s.services.filter(id => id !== "app") });
  if (line.id === "pages") return { ...s, extraPages: 0 };
  if (line.id === "care" || line.id === "plus") return { ...s, care: "none" };
  if (line.service === "web") return { ...s, extras: s.extras.filter(id => id !== line.id), visibility: s.visibility.filter(id => id !== line.id) };
  const packages = s.automationPackages.filter(id => id !== line.id);
  const custom = line.id === "custom-automation" ? false : s.customAutomation;
  return normalizeSelection({ ...s, automationPackages: packages, customAutomation: custom,
    services: packages.length || custom ? s.services : s.services.filter(id => id !== "automation") });
}

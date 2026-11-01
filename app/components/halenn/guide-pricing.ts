import { createBriefModel, parseSelection, money, automationExclusions, appExclusions, appLimitations } from "../pricing/catalog";
import { guideBrief, guideRecommendation, type GuideAnswers } from "./solution-guide";

export function guidePricingDetails(answers: GuideAnswers) {
  const recommendation = guideRecommendation(answers);
  if (recommendation.pricingQuery) {
    // Use the same selection parser and calculator as the pricing-page handoff.
    const estimate = createBriefModel(parseSelection(Object.fromEntries(new URLSearchParams(recommendation.pricingQuery))));
    if (estimate.oneTime > 0 && !estimate.quoteRequired) {
      const runningCosts = estimate.selection.services.includes("automation") ? automationExclusions
        : estimate.selection.services.includes("app") ? `${appExclusions} App care is optional.`
        : "Hosting, domains, payment fees and platform subscriptions are separate. Website care is optional.";
      const scopeNote = estimate.selection.services.includes("app") ? appLimitations : undefined;
      return { kind: "estimate" as const, estimate, runningCosts, scopeNote };
    }
  }

  const reasons: Record<string, string> = {
    "booking-connections": "We need to check your existing website and booking tools, then agree which connections and follow-ups you need.",
    "website-review": "We need to review your current website and agree which improvements or connections will make the most difference.",
    "shop-review": "We need to review your current shop or booking setup and confirm what can be reused before pricing the changes.",
    agent: "We need to agree the tasks your agent can carry out, the tools it will connect to and when a person should approve an action.",
    "assistant-workflow": "We need to define the questions, connected tools and follow-up actions your assistant should handle.",
    assistant: "We need to agree who will use the assistant, where it will work and which information it can use.",
    workflow: "We need to map the steps, connected tools and exceptions before pricing your workflow.",
    "automation-review": "We need to understand the task and your existing tools before choosing and pricing the right approach.",
    "mobile-app": "We need to review your existing app and its connections before pricing the improvements.",
    portal: "We need to agree the main features, user access and connections before pricing your app or portal.",
    conversation: "We’ll first clarify your priority and recommend a focused scope, then give you a price to consider.",
  };
  return { kind: "custom" as const, reason: reasons[recommendation.id] ?? "We need to agree the features, connections and scope before confirming your price." };
}

export function guideEnquiryBrief(answers: GuideAnswers) {
  const pricing = guidePricingDetails(answers);
  return [guideBrief(answers), "", pricing.kind === "estimate"
    ? [
      `Starting estimate: From ${money(pricing.estimate.oneTime)} one-time, excluding VAT.`,
      ...pricing.estimate.lines.map(line => `${line.name}: ${money(line.price!)}`),
      pricing.runningCosts,
      pricing.estimate.disclaimer,
    ].join("\n")
    : `A tailored quote is needed. ${pricing.reason}`,
  ].join("\n");
}

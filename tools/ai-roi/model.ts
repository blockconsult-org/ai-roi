export const TOOL_ID = "ai-roi";
export const SCHEMA_VERSION = 1;
export const METHODOLOGY_VERSION = "1.0";
export const scenarioIds = ["conservative", "expected", "optimistic"] as const;
export type ScenarioId = typeof scenarioIds[number];
export type Currency = "CHF" | "EUR" | "USD";

export const commonRules = {
  volume: { min: 0, max: 1_000_000 },
  baseline: { min: 0, max: 1440 },
  hourlyCost: { min: 0, max: 100_000 },
  horizon: { min: 1, max: 36, integer: true },
} as const;
export const scenarioRules = {
  adoption: { min: 0, max: 100 },
  coverage: { min: 0, max: 100 },
  residual: { min: 0, max: 1440 },
  review: { min: 0, max: 1440 },
  realization: { min: 0, max: 100 },
  setup: { min: 0, max: 100_000_000 },
  software: { min: 0, max: 10_000_000 },
  usage: { min: 0, max: 10_000_000 },
  maintenance: { min: 0, max: 10_000_000 },
  delay: { min: 0, max: 36, integer: true },
  ramp: { min: 0, max: 36, integer: true },
} as const;
export type CommonKey = keyof typeof commonRules;
export type ScenarioKey = keyof typeof scenarioRules;
export type Scenario = Record<ScenarioKey, number>;
export type Model = Record<CommonKey, number> & {
  tool: typeof TOOL_ID;
  schemaVersion: typeof SCHEMA_VERSION;
  methodologyVersion: typeof METHODOLOGY_VERSION;
  currency: Currency;
  title: string;
  notes: string;
  scenarios: Record<ScenarioId, Scenario>;
};
export type Rule = { min: number; max: number; integer?: boolean };
export function validNumber(value: unknown, rule: Rule): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= rule.min && value <= rule.max && (!rule.integer || Number.isInteger(value));
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function validateModel(value: unknown): value is Model {
  if (!record(value) || !exactKeys(value, ["tool", "schemaVersion", "methodologyVersion", "currency", "title", "notes", "scenarios", ...Object.keys(commonRules)])) return false;
  if (value.tool !== TOOL_ID || value.schemaVersion !== SCHEMA_VERSION || value.methodologyVersion !== METHODOLOGY_VERSION) return false;
  if (typeof value.currency !== "string" || !["CHF", "EUR", "USD"].includes(value.currency)) return false;
  if (typeof value.title !== "string" || value.title.length > 120 || typeof value.notes !== "string" || value.notes.length > 2000) return false;
  if (!Object.entries(commonRules).every(([key, rule]) => validNumber(value[key], rule))) return false;
  const scenarios = value.scenarios;
  if (!record(scenarios) || !exactKeys(scenarios, [...scenarioIds])) return false;
  return scenarioIds.every(id => {
    const scenario = scenarios[id];
    return record(scenario) && exactKeys(scenario, Object.keys(scenarioRules)) && Object.entries(scenarioRules).every(([key, rule]) => validNumber(scenario[key], rule));
  });
}

export const presetIds = ["invoice", "enquiry", "reporting"] as const;
export type PresetId = typeof presetIds[number];
export function preset(id: PresetId = "invoice"): Model {
  const base: Scenario = { adoption: 80, coverage: 75, residual: 2, review: 2, realization: 0, setup: 3300, software: 200, usage: 100, maintenance: 100, delay: 0, ramp: 0 };
  const common = { volume: 1000, baseline: 10, hourlyCost: 50, horizon: 12 };
  if (id === "enquiry") {
    Object.assign(common, { volume: 600, baseline: 12, hourlyCost: 60 });
    Object.assign(base, { coverage: 60, residual: 3, review: 2, setup: 5000, software: 150, usage: 80, maintenance: 200, delay: 1, ramp: 3 });
  }
  if (id === "reporting") {
    Object.assign(common, { volume: 40, baseline: 120, hourlyCost: 80 });
    Object.assign(base, { coverage: 90, residual: 20, review: 15, setup: 6000, software: 120, usage: 30, maintenance: 250, delay: 2, ramp: 2 });
  }
  return {
    tool: TOOL_ID, schemaVersion: SCHEMA_VERSION, methodologyVersion: METHODOLOGY_VERSION,
    ...common, currency: "CHF", title: "", notes: "",
    scenarios: {
      conservative: { ...base, adoption: 60, coverage: base.coverage - 15, review: base.review * 1.5, setup: base.setup * 1.2, delay: base.delay + 1, ramp: base.ramp + 2 },
      expected: { ...base },
      optimistic: { ...base, adoption: 95, coverage: Math.min(100, base.coverage + 10), review: base.review * 0.75, setup: base.setup * 0.9 },
    },
  };
}

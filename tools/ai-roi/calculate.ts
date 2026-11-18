import { validateModel, type Model, type ScenarioId } from "./model";

export interface Month {
  month: number; adoption: number; automated: number; hours: number; laborValue: number;
  cash: number; extraLabor: number; setup: number; software: number; usage: number;
  maintenance: number; costs: number; net: number; cumulative: number;
}
export function calculate(model: Model, id: ScenarioId) {
  if (!validateModel(model)) throw new Error("Invalid AI ROI model");
  const s = model.scenarios[id];
  const months: Month[] = [];
  let cumulative = -s.setup;
  let breakEven: number | null = s.setup === 0 ? 0 : null;
  let payback: number | null = s.setup === 0 ? 0 : null;
  months.push({ month: 0, adoption: 0, automated: 0, hours: 0, laborValue: 0, cash: 0, extraLabor: 0, setup: s.setup, software: 0, usage: 0, maintenance: 0, costs: s.setup, net: -s.setup, cumulative });
  for (let month = 1; month <= model.horizon; month++) {
    const liveMonth = month - s.delay;
    const live = liveMonth > 0;
    const factor = live ? (s.ramp === 0 ? 1 : Math.min(1, liveMonth / s.ramp)) : 0;
    const adoption = s.adoption * factor;
    const automated = model.volume * adoption / 100 * s.coverage / 100;
    const hours = automated * (model.baseline - s.residual - s.review) / 60;
    const laborValue = hours * model.hourlyCost;
    const cash = Math.max(0, laborValue) * s.realization / 100;
    const extraLabor = Math.max(0, -laborValue);
    const software = live ? s.software : 0;
    const usage = live ? s.usage : 0;
    const maintenance = live ? s.maintenance : 0;
    const costs = extraLabor + software + usage + maintenance;
    const net = cash - costs;
    const previous = cumulative;
    cumulative += net;
    if (breakEven === null && cumulative >= 0) {
      breakEven = month;
      payback = month - 1 + (-previous / net);
    }
    months.push({ month, adoption, automated, hours, laborValue, cash, extraLabor, setup: 0, software, usage, maintenance, costs, net, cumulative });
  }
  const sum = (key: keyof Pick<Month, "hours" | "laborValue" | "cash" | "costs" | "extraLabor" | "software" | "usage" | "maintenance">) => months.reduce((total, row) => total + row[key], 0);
  const costs = sum("costs");
  const cash = sum("cash");
  return { months, costs, cash, net: cash - costs, hours: sum("hours"), laborValue: sum("laborValue"), extraLabor: sum("extraLabor"), software: sum("software"), usage: sum("usage"), maintenance: sum("maintenance"), roi: costs === 0 ? null : (cash - costs) / costs * 100, breakEven, payback };
}
export type Result = ReturnType<typeof calculate>;

import type { Locale } from "@/content/i18n";
import { calculate } from "./calculate";
import { copy, formatters } from "./copy";
import { commonRules, scenarioIds, scenarioRules, type CommonKey, type Model, type ScenarioId, type ScenarioKey } from "./model";

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Text is drawn as text, never interpreted as HTML or SVG markup. */
export async function summaryPng(model: Model, locale: Locale, selected: ScenarioId): Promise<Blob> {
  const t = copy[locale]; const f = formatters(locale, model.currency);
  const results = scenarioIds.map(id => calculate(model, id));
  const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = 4096;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#f7f8fa"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 68;
  const line = (text: string, size = 22, color = "#0b0d10") => {
    ctx.font = `${size}px Arial, sans-serif`; ctx.fillStyle = color;
    const words = text.split(/\s+/); let current = "";
    for (const word of words) {
      if (ctx.measureText(current + word).width > 1450) { ctx.fillText(current, 60, y); y += size * 1.4; current = ""; }
      // Authored long words are not included in this summary; numeric values are bounded.
      current += `${word} `;
    }
    ctx.fillText(current, 60, y); y += size * 1.5;
  };
  line(`BLOCK CONSULT / ${t.title}`, 36);
  line(`${t.estimates} · ${model.currency} · ${model.horizon} ${t.months}`, 24);
  line(`${t.version} ${model.methodologyVersion} · ${t.schema} ${model.schemaVersion}`, 20);
  y += 18;
  for (const [index, id] of scenarioIds.entries()) {
    const r = results[index];
    line(`${t.scenarios[id]}${id === selected ? " ◀" : ""}`, 26, "#2360bd");
    line(`${t.capacity}: ${f.n(r.hours)} ${t.hoursUnit} · ${t.capacityValue}: ${f.money(r.laborValue)}`);
    line(`${t.cash}: ${f.money(r.cash)} · ${t.costs}: ${f.money(r.costs)}`);
    line(`${t.net}: ${f.money(r.net)} · ROI: ${r.roi === null ? t.undefinedRoi : `${f.n(r.roi)}%`} · ${t.breakEven}: ${r.breakEven === null ? t.noBreakEven : r.breakEven}`);
    y += 10;
  }
  line(t.chart, 26);
  const values = results.flatMap(r => r.months.map(m => m.cumulative)); const lo = Math.min(0, ...values); const hi = Math.max(0, ...values); const span = hi - lo || 1;
  const top = y; const py = (v: number) => top + 200 - (v - lo) / span * 190;
  ctx.strokeStyle = "#666c75"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(100, py(0)); ctx.lineTo(1480, py(0)); ctx.stroke();
  results.forEach((result, index) => { ctx.strokeStyle = index === 1 ? "#2360bd" : "#0b0d10"; ctx.lineWidth = 3; ctx.setLineDash([[5, 8], [], [16, 8]][index]); ctx.beginPath(); result.months.forEach((row, i) => { const x = 100 + row.month / model.horizon * 1380; if (i === 0) ctx.moveTo(x, py(row.cumulative)); else ctx.lineTo(x, py(row.cumulative)); }); ctx.stroke(); });
  ctx.setLineDash([]); y = top + 230;
  line(`${t.month} 0 → ${model.horizon} · ${t.scenarios.conservative} (···) / ${t.scenarios.expected} (—) / ${t.scenarios.optimistic} (– –)`, 20);
  line(t.printAssumptions, 26);
  for (const key of Object.keys(commonRules) as CommonKey[]) line(`${t.fields[key]}: ${f.n(model[key])}`, 20);
  line(scenarioIds.map(id => t.scenarios[id]).join(" / "), 20, "#2360bd");
  for (const key of Object.keys(scenarioRules) as ScenarioKey[]) line(`${t.fields[key]}: ${scenarioIds.map(id => f.n(model.scenarios[id][key])).join(" / ")}`, 20);
  y += 15;
  for (const paragraph of [t.realizationHelp, t.costHelp, t.methodologyText[2], t.methodologyText[4]]) line(paragraph, 20, "#4d535c");
  // Crop to content and leave a comfortable footer margin.
  const output = document.createElement("canvas"); output.width = canvas.width; output.height = Math.min(canvas.height, Math.ceil(y + 30));
  output.getContext("2d")?.drawImage(canvas, 0, 0);
  return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error("png")), "image/png"));
}

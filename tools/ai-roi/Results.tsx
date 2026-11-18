"use client";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/content/i18n";
import { commonRules, scenarioIds, scenarioRules, type Model, type ScenarioId, type ScenarioKey, type CommonKey } from "./model";
import { calculate, type Result } from "./calculate";
import { copy, formatters } from "./copy";
import { designCopy } from "./design-copy";
import styles from "./tool.module.css";

export function Assumptions({ model, locale }: { model: Model; locale: Locale }) {
  const t = copy[locale]; const f = formatters(locale, model.currency);
  return <div className={styles.tableWrap} role="region" aria-label={t.assumptions} tabIndex={0}>
    <table><caption>{t.printAssumptions} · {model.currency}</caption><thead><tr><th scope="col">{t.assumptions}</th>{scenarioIds.map(id => <th scope="col" key={id}>{t.scenarios[id]}</th>)}</tr></thead>
      <tbody>{(Object.keys(commonRules) as CommonKey[]).map(key => <tr key={key}><th scope="row">{t.fields[key]}</th>{scenarioIds.map(id => <td key={id}>{f.n(model[key])}</td>)}</tr>)}
        {(Object.keys(scenarioRules) as ScenarioKey[]).map(key => <tr key={key}><th scope="row">{t.fields[key]}{new Set(scenarioIds.map(id => model.scenarios[id][key])).size > 1 ? " *" : ""}</th>{scenarioIds.map(id => <td key={id}>{f.n(model.scenarios[id][key])}</td>)}</tr>)}
      </tbody></table>
  </div>;
}

export function Chart({ results, locale, currency, selected }: { results: Record<ScenarioId, Result>; locale: Locale; currency: string; selected: ScenarioId }) {
  const t = copy[locale]; const f = formatters(locale, currency);
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = frame.current; if (!element) return;
    const observer = new ResizeObserver(entries => { if (entries[0].contentRect.width > 0) setWidth(entries[0].contentRect.width); });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const horizon = results.expected.months.length - 1;
  const [cursor, setCursor] = useState(0);
  const month = Math.min(cursor, horizon);
  const all = scenarioIds.flatMap(id => results[id].months.map(row => row.cumulative));
  const low = Math.min(0, ...all); const high = Math.max(0, ...all) || (low === 0 ? 1 : 0);
  const span = high - low;
  function figure(width: number, printing = false) {
  const x = (m: number) => 64 + m / horizon * (width - 80);
  const y = (value: number) => 210 - (value - low) / span * 180;
    return <svg data-testid={printing ? "cash-chart-print" : "cash-chart"} className={styles.chart} viewBox={`0 0 ${width} 250`} role="img" aria-label={`${t.chart} · ${currency}`} onPointerMove={printing ? undefined : event => {
      const box = event.currentTarget.getBoundingClientRect();
      setCursor(Math.max(0, Math.min(horizon, Math.round(((event.clientX - box.left) / box.width * width - 64) / (width - 80) * horizon))));
    }}>
      <title>{t.chart}</title>
      {[low, (low + high) / 2, high].map((value, index) => <g key={index}><line x1="64" x2={width - 16} y1={y(value)} y2={y(value)} stroke="currentColor" opacity=".15" /><text x="54" y={y(value) + 4} textAnchor="end" fill="currentColor" fontSize="12">{new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value)}</text></g>)}
      <line x1="64" x2={width - 16} y1={y(0)} y2={y(0)} stroke="currentColor" strokeDasharray="3 4" opacity=".5" />
      {scenarioIds.map((id, index) => <polyline key={id} points={results[id].months.map(row => `${x(row.month)},${y(row.cumulative)}`).join(" ")} fill="none" stroke={id === "expected" ? "var(--color-link)" : "currentColor"} strokeWidth={id === selected ? 3 : 2} strokeDasharray={["4 5", "", "10 5"][index]} />)}
      <line x1={x(month)} x2={x(month)} y1="30" y2="210" stroke="currentColor" opacity=".35" />
      <text x="64" y="240" fill="currentColor" fontSize="13">{t.month} 0</text><text x={width - 16} y="240" textAnchor="end" fill="currentColor" fontSize="13">{t.month} {horizon}</text>
    </svg>;
  }
  return <section className={styles.panel} aria-labelledby="roi-chart-title">
    <h3 id="roi-chart-title">{t.chart}</h3><p>{t.allMoney} {currency}. <span className={styles.noPrint}>{t.chartHelp}</span></p>
    <div ref={frame} className={`${styles.chartFrame} ${styles.noPrint}`}>{figure(width)}</div><div className={styles.printChart}>{figure(640, true)}<p>{t.inspect}: {month}</p></div>
    <div className={`${styles.noPrint} ${styles.chartControl}`}><label htmlFor="roi-chart-month">{t.inspect}: {month}</label><input id="roi-chart-month" type="range" min="0" max={horizon} value={month} onChange={event => setCursor(Number(event.target.value))} /></div>
    <ul className={styles.legend} aria-live="polite">{scenarioIds.map((id, index) => <li key={id} data-series={id} data-selected={selected === id}><span aria-hidden="true">{["┄", "━", "╌"][index]} </span>{t.scenarios[id]}<span className={styles.srOnly}> · {t.month} {month}:</span> <strong>{f.money(results[id].months[month].cumulative)}</strong></li>)}</ul>
  </section>;
}

export function Results({ model, locale, selected }: { model: Model; locale: Locale; selected: ScenarioId }) {
  const t = copy[locale]; const f = formatters(locale, model.currency);
  const results = Object.fromEntries(scenarioIds.map(id => [id, calculate(model, id)])) as Record<ScenarioId, Result>;
  const r = results[selected]; const u = designCopy[locale];
  const compact = (value: number) => new Intl.NumberFormat(locale === "de" ? "de-CH" : "en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  const money = (value: number) => Math.abs(value) >= 10_000_000 ? `${model.currency} ${compact(value)}` : f.money(value);
  const payback = (result: Result) => result.breakEven === null ? t.noBreakEven : result.breakEven === 0 ? t.noSetup : `${t.month} ${result.breakEven}`;
  return <div className={styles.results} data-testid="roi-results">
    <div className={styles.sectionHeading}><h2>{u.results}</h2><span>{t.scenarios[selected]} · {model.horizon} {t.months} · {model.currency}</span></div>
    <div className={styles.kpis}>
      <div><span>{t.capacity}</span><strong data-testid="kpi-hours" title={f.n(r.hours)}>{Math.abs(r.hours) >= 1_000_000 ? compact(r.hours) : f.n(r.hours)} {t.hoursUnit}</strong><small>{u.capacityNote}</small></div>
      <div><span>{t.cash} · {model.currency}</span><strong data-testid="kpi-cash" title={f.money(r.cash)}>{Math.abs(r.cash) >= 10_000_000 ? compact(r.cash) : f.n(r.cash)}</strong><small>{u.cashNoteShort}</small></div>
      <div><span>{t.net} · {model.currency}</span><strong data-testid="kpi-net" title={f.money(r.net)}>{Math.abs(r.net) >= 10_000_000 ? compact(r.net) : f.n(r.net)}</strong><small>{u.costsNote}</small></div>
      <div><span>{t.roi}</span><strong data-testid="kpi-roi">{r.roi === null ? "—" : `${Math.abs(r.roi) >= 1_000_000 ? compact(r.roi) : f.n(r.roi)}%`}</strong><small>{r.roi === null ? t.undefinedRoi : payback(r)}</small></div>
    </div>
    <p className={styles.resultsNote}>{t.estimates}. {t.capacityValue}: <strong>{money(r.laborValue)}</strong>. {t.nonCash}</p>
    {[r.hours, r.cash, r.net, r.laborValue].some(value => Math.abs(value) >= 1_000_000) && <p>{u.compact}</p>}
    {r.hours < 0 && <p className={styles.notice} role="status">{t.negative}</p>}
    <Chart results={results} locale={locale} currency={model.currency} selected={selected} />
    <section className={styles.panel}><h3>{t.comparison}</h3><p className={styles.noPrint}>{u.comparisonNote}</p><p className={styles.printOnly}>{t.comparisonHelp}</p><p className={`${styles.tableHint} ${styles.noPrint}`}>{u.tableHint}</p>
      <div className={styles.tableWrap} role="region" aria-label={t.comparison} tabIndex={0}><table><caption>{t.estimates} · {model.currency} · {model.horizon} {t.months}</caption><thead><tr><th scope="col">{t.horizon}</th>{scenarioIds.map(id => <th key={id} scope="col" data-selected={selected === id}>{t.scenarios[id]}</th>)}</tr></thead><tbody>
        {([ [t.capacity, (r: Result) => `${f.n(r.hours)} ${t.hoursUnit}`], [t.capacityValue, (r: Result) => f.money(r.laborValue)], [t.cash, (r: Result) => f.money(r.cash)], [t.costs, (r: Result) => f.money(r.costs)], [t.net, (r: Result) => f.money(r.net)], [t.roi, (r: Result) => r.roi === null ? t.undefinedRoi : `${f.n(r.roi)}%`], [t.breakEven, payback], [t.fractional, (r: Result) => r.payback === null ? t.noBreakEven : `${f.n(r.payback)} ${t.months}`] ] as [string, (r: Result) => string][]).map(([label, format]) => <tr key={label}><th scope="row">{label}</th>{scenarioIds.map(id => <td key={id} data-selected={selected === id}>{format(results[id])}</td>)}</tr>)}
      </tbody></table></div><p>{t.interpolation}</p>
    </section>
    <details className={styles.panel}><summary>{t.breakdown} · {t.scenarios[selected]}</summary><dl className={styles.breakdown}>
      {[[t.setup, model.scenarios[selected].setup], [t.software, r.software], [t.usage, r.usage], [t.maintenance, r.maintenance], [t.extraLabor, r.extraLabor], [t.costs, r.costs], [t.cash, r.cash], [t.net, r.net]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{f.money(Number(value))}</dd></div>)}
    </dl></details>
    <details className={styles.panel}><summary>{t.assumptions}</summary><Assumptions model={model} locale={locale} /></details>
    <details className={`${styles.panel} ${styles.monthly}`}><summary>{t.monthly} · {t.scenarios[selected]}</summary><div className={styles.tableWrap} role="region" aria-label={t.monthly} tabIndex={0}><table><caption>{t.allMoney} {model.currency}</caption><thead><tr>{[t.month, t.adoption, t.automated, t.capacity, t.laborValue, t.cash, t.costs, t.operating, t.cumulative].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{r.months.map(row => <tr key={row.month}><th scope="row">{row.month}</th>{[row.adoption, row.automated, row.hours, row.laborValue, row.cash, row.costs, row.net, row.cumulative].map((v, i) => <td key={i}>{f.n(v)}</td>)}</tr>)}</tbody></table></div></details>
  </div>;
}

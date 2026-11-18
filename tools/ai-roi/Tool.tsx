"use client";
import { useEffect, useRef, useState } from "react";
import { localeHref, type Locale } from "@/content/i18n";
import { SelectField } from "@/simulator/components/fields/select-field";
import { Segmented } from "@/simulator/components/fields/segmented";
import { commonRules, preset, presetIds, scenarioIds, scenarioRules, validNumber, validateModel, type CommonKey, type Currency, type Model, type PresetId, type Rule, type ScenarioId, type ScenarioKey } from "./model";
import { decodeShare, encodeShare, MAX_JSON_BYTES, parseModel, serializeModel, shareModel, STORAGE_KEY, TRANSFER_KEY } from "./codec";
import { copy, formatters } from "./copy";
import { download, summaryPng } from "./export";
import { Assumptions, Results } from "./Results";
import { designCopy } from "./design-copy";
import { ActionMenu } from "./ActionMenu";
import styles from "./tool.module.css";

function NumberField({ id, label, shortLabel, unit, value, rule, locale, onChange, disabled }: { id: string; label: string; shortLabel: string; unit: string; value: number; rule: Rule; locale: Locale; onChange: (n: number) => void; disabled: boolean }) {
  const t = copy[locale]; const invalid = !validNumber(value, rule); const f = formatters(locale, "CHF");
  return <div className={styles.field}><label htmlFor={id}>{shortLabel}<span>{unit}</span></label><input id={id} aria-label={`${shortLabel} · ${unit}`} title={label} type="number" inputMode={rule.integer ? "numeric" : "decimal"} min={rule.min} max={rule.max} step={rule.integer ? 1 : "any"} value={Number.isFinite(value) ? value : ""} disabled={disabled} onChange={event => onChange(event.target.value === "" ? NaN : Number(event.target.value))} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} />
    {invalid && <small id={`${id}-error`}>{t.range} {f.n(rule.min)} {t.to} {f.n(rule.max)}. {rule.integer && t.integer}</small>}
  </div>;
}

export function Tool({ locale }: { locale: Locale }) {
  const t = copy[locale]; const u = designCopy[locale]; const f = formatters(locale, "CHF");
  const [draft, setDraft] = useState<Model>(() => preset());
  const [snapshot, setSnapshot] = useState<Model | null>(null);
  const [selected, setSelected] = useState<ScenarioId>("expected");
  const [presetId, setPresetId] = useState<PresetId | "custom">("invoice");
  const [view, setView] = useState<"inputs" | "results">("inputs");
  const [imageState, setImageState] = useState<"idle" | "busy" | "done">("idle");
  const [notice, setNotice] = useState<keyof typeof t.notices | null>(null);
  const [preview, setPreview] = useState(false);
  const [includeText, setIncludeText] = useState(false);
  const [link, setLink] = useState("");
  const [ready, setReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const switchRef = useRef<HTMLDivElement>(null);
  const sharedHash = useRef("");
  const routerHistoryState = useRef<unknown>(null);
  const model = snapshot ?? draft;
  const readOnly = snapshot !== null;
  const valid = validateModel(model);
  const issues: { key: CommonKey | ScenarioKey; scenario?: ScenarioId; label: string }[] = [];
  for (const key of Object.keys(commonRules) as CommonKey[]) if (!validNumber(model[key], commonRules[key])) issues.push({ key, label: u.fieldLabels[key] });
  for (const scenario of scenarioIds) for (const key of Object.keys(scenarioRules) as ScenarioKey[]) if (!validNumber(model.scenarios[scenario][key], scenarioRules[key])) issues.push({ key, scenario, label: `${t.scenarios[scenario]} · ${u.fieldLabels[key]}` });

  useEffect(() => {
    // Native fragment navigation can create an entry with a null state. Keep
    // the current route state so removing a scenario never remounts the tool.
    routerHistoryState.current = window.history.state;
    function syncHash() {
      if (window.location.hash === "#main") { if (sharedHash.current) window.history.replaceState(window.history.state ?? routerHistoryState.current, "", sharedHash.current); return; }
      if (!window.location.hash) { sharedHash.current = ""; setSnapshot(null); return; }
      try { setSnapshot(decodeShare(window.location.hash)); sharedHash.current = window.location.hash; setView("results"); setNotice(null); }
      catch { setNotice("invalid"); }
      setPreview(false); setLink("");
    }
    // Browser state is only read here. No automatic local draft writes or loads.
    const timer = window.setTimeout(() => {
    syncHash();
    try {
      const raw = sessionStorage.getItem(TRANSFER_KEY);
      if (raw && raw.length <= MAX_JSON_BYTES) {
        sessionStorage.removeItem(TRANSFER_KEY);
        const transfer: unknown = JSON.parse(raw);
        if (transfer && typeof transfer === "object" && "locale" in transfer && transfer.locale === locale && "model" in transfer && validateModel(transfer.model)) {
          setDraft(transfer.model);
          if ("selected" in transfer && scenarioIds.includes(transfer.selected as ScenarioId)) setSelected(transfer.selected as ScenarioId);
          if ("presetId" in transfer && (transfer.presetId === "custom" || presetIds.includes(transfer.presetId as PresetId))) setPresetId(transfer.presetId as PresetId | "custom");
          if ("view" in transfer && (transfer.view === "inputs" || transfer.view === "results") && !window.location.hash) setView(transfer.view);
        }
      }
    } catch { /* The calculator is usable with storage disabled. */ }
    setReady(true);
    }, 0);
    window.addEventListener("hashchange", syncHash);
    const opened: HTMLDetailsElement[] = [];
    function beforePrint() { rootRef.current?.querySelectorAll("details:not([open])").forEach(node => { const details = node as HTMLDetailsElement; details.open = true; opened.push(details); }); }
    function afterPrint() { opened.splice(0).forEach(details => { details.open = false; }); }
    window.addEventListener("beforeprint", beforePrint); window.addEventListener("afterprint", afterPrint);
    return () => { window.clearTimeout(timer); window.removeEventListener("hashchange", syncHash); window.removeEventListener("beforeprint", beforePrint); window.removeEventListener("afterprint", afterPrint); };
  }, [locale]);

  useEffect(() => {
    if (preview) { dialogRef.current?.showModal(); dialogRef.current?.querySelector<HTMLElement>("h2")?.focus(); }
    else dialogRef.current?.close();
  }, [preview]);

  function edit(next: Model) { setDraft(next); setPresetId("custom"); setLink(""); setNotice(null); setImageState("idle"); }
  // Preserve router state: changing only the scenario fragment must not start
  // a route transition that can overwrite the next hash or remount the draft.
  function clearHash() { sharedHash.current = ""; window.history.replaceState(window.history.state ?? routerHistoryState.current, "", window.location.pathname + window.location.search); }
  function replace(next: Model) { clearHash(); setSnapshot(null); edit(next); setPreview(false); }
  function storage(action: "save" | "load" | "delete") {
    try {
      if (action === "save") { localStorage.setItem(STORAGE_KEY, serializeModel(model)); setNotice("saved"); }
      if (action === "delete") { localStorage.removeItem(STORAGE_KEY); setNotice("deleted"); }
      if (action === "load") {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) { setNotice("missing"); return; }
        let restored: Model;
        try { restored = parseModel(raw); } catch { setNotice("invalid"); return; }
        replace(restored); setNotice("loaded");
      }
    } catch { setNotice("storage"); }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    try { if (file.size > MAX_JSON_BYTES) throw new Error("size"); const next = parseModel(await file.text()); replace(next); setNotice("imported"); }
    catch { setNotice("invalid"); }
    if (fileRef.current) fileRef.current.value = "";
  }
  function json() { if (valid) download(new Blob([serializeModel(model)], { type: "application/json" }), "blockconsult-ai-roi-v1.json"); }
  function createLink() {
    try { setLink("https://www.blockconsult.org" + localeHref(locale, "/tools/ai-roi") + encodeShare(model, includeText)); setNotice(null); }
    catch { setLink(""); setNotice("large"); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setNotice("copied"); }
    catch { setNotice("copyFallback"); }
  }
  function changeLanguage() {
    const target = locale === "en" ? "de" : "en";
    try {
      sessionStorage.setItem(TRANSFER_KEY, JSON.stringify({ locale: target, model: draft, selected, presetId, view }));
      window.location.assign(localeHref(target, "/tools/ai-roi") + (readOnly ? window.location.hash : ""));
    } catch {
      if (readOnly) window.location.assign(localeHref(target, "/tools/ai-roi") + window.location.hash);
      else setNotice("locale");
    }
  }
  const disabled = !ready || readOnly;
  const money = formatters(locale, model.currency).money;
  const scenario = model.scenarios[selected];
  function field(key: CommonKey | ScenarioKey) {
    const common = key in commonRules;
    const rule = common ? commonRules[key as CommonKey] : scenarioRules[key as ScenarioKey];
    const unit = (["hourlyCost", "setup", "software", "usage", "maintenance"].includes(key) ? model.currency + " " : "") + u.units[key];
    return <NumberField key={key} id={`roi-${key}`} label={t.fields[key].replaceAll(locale === "en" ? "currency" : "Währung", model.currency)} shortLabel={u.fieldLabels[key]} unit={unit} value={common ? model[key as CommonKey] : scenario[key as ScenarioKey]} rule={rule} locale={locale} disabled={disabled} onChange={value => edit(common ? { ...model, [key]: value } : { ...model, scenarios: { ...model.scenarios, [selected]: { ...scenario, [key]: value } } })} />;
  }
  function changeView(next: "inputs" | "results") { setView(next); requestAnimationFrame(() => switchRef.current?.scrollIntoView({ behavior: "instant", block: "start" })); }
  function focusIssue(issue: typeof issues[number]) {
    if (issue.scenario) setSelected(issue.scenario);
    setView("inputs");
    requestAnimationFrame(() => {
      const input = document.getElementById(`roi-${issue.key}`);
      const details = input?.closest("details"); if (details) details.open = true;
      input?.focus(); input?.scrollIntoView({ behavior: "instant", block: "center" });
    });
  }
  async function png() {
    setImageState("busy"); setNotice(null);
    try { download(await summaryPng(model, locale, selected), `blockconsult-ai-roi-${locale}.png`); setImageState("done"); }
    catch { setNotice("image"); setImageState("idle"); }
  }
  const costsValid = (["setup", "software", "usage", "maintenance"] as const).every(key => validNumber(scenario[key], scenarioRules[key]));
  const timingValid = validNumber(scenario.delay, scenarioRules.delay) && validNumber(scenario.ramp, scenarioRules.ramp);
  return <div ref={rootRef} className={styles.root} data-ai-roi data-view={view} onFocusCapture={event => {
    if (event.target.matches("input, textarea, [role=combobox]")) { const target = event.target; requestAnimationFrame(() => target.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" })); }
  }}>
    <div className={`${styles.workspaceBar} ${styles.noPrint}`}>
      <div className={styles.startControls}>
        <SelectField id="roi-preset" label={u.start} value={presetId} options={[...presetIds.map(value => ({ value: value as PresetId | "custom", label: t.presets[value] })), ...(presetId === "custom" ? [{ value: "custom" as const, label: u.custom }] : [])]} disabled={disabled} onChange={value => { if (value !== "custom") { replace(preset(value)); setPresetId(value); } }} />
        <SelectField id="roi-currency" label={u.currency} value={model.currency} options={(["CHF", "EUR", "USD"] as Currency[]).map(value => ({ value, label: value }))} disabled={disabled} onChange={currency => edit({ ...model, currency })} />
      </div>
      <div className={styles.actions}>
        <button ref={shareRef} className={styles.primary} type="button" aria-label={`${u.share} · ${t.share}`} disabled={!valid || !ready} onClick={() => { setPreview(true); setIncludeText(false); setLink(""); setNotice(null); }}>{u.share} ↗</button>
        <button className={styles.button} type="button" aria-label={`${u.save} · ${t.save}`} disabled={disabled || !valid} onClick={() => storage("save")}>{u.save}</button>
        <ActionMenu label={u.actions} actions={[
          { label: t.export, onClick: json, disabled: !valid || !ready, group: u.files },
          { label: t.import, onClick: () => fileRef.current?.click(), disabled, group: u.files },
          { label: t.print, onClick: () => window.print(), disabled: !valid || !ready, group: u.files },
          { label: t.png, onClick: () => void png(), disabled: !valid || !ready || imageState === "busy", group: u.files },
          { label: t.load, onClick: () => storage("load"), disabled, group: u.draft },
          { label: t.delete, onClick: () => storage("delete"), disabled, destructive: true, group: u.draft },
          { label: t.reset, onClick: () => { replace(preset()); setPresetId("invoice"); }, disabled, destructive: true, group: u.resetGroup },
        ]} />
        <button className={styles.language} type="button" aria-label={t.language} disabled={!valid || !ready} onClick={changeLanguage}>{locale === "en" ? "DE" : "EN"} <span aria-hidden="true">↗</span></button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label={t.import} onChange={event => void importFile(event.target.files?.[0])} />
      </div>
    </div>
    <p className={`${styles.status} ${styles.noPrint}`} role="status" aria-live="polite">{preview ? u.privacy : notice ? t.notices[notice] : imageState === "busy" ? u.imageBusy : imageState === "done" ? u.imageDone : u.privacy}</p>
    {readOnly && <section className={styles.snapshot}><div><h2>{t.shared}</h2><p>{t.sharedHelp}</p></div><div className={`${styles.toolbar} ${styles.noPrint}`}><button className={styles.primary} type="button" onClick={() => { replace(structuredClone(model)); setView("inputs"); setNotice("copy"); }}>{t.makeCopy}</button><button className={styles.button} type="button" onClick={() => { clearHash(); setSnapshot(null); setPreview(false); setView("inputs"); }}>{t.backDraft}</button></div></section>}
    <div className={`${styles.scenarioBar} ${styles.noPrint}`}>
      <Segmented id="roi-scenario" label={u.scenario} value={selected} options={scenarioIds.map(value => ({ value, label: t.scenarios[value] + (issues.some(issue => issue.scenario === value) ? " *" : "") }))} onChange={setSelected} />
      <p>{u.scenarioNote}</p>
    </div>
    <div ref={switchRef} className={`${styles.viewSwitch} ${styles.noPrint}`} aria-label={u.scenario}>
      <button type="button" aria-pressed={view === "inputs"} aria-controls="roi-inputs-panel" onClick={() => changeView("inputs")}>{u.inputs}</button>
      <button type="button" aria-pressed={view === "results"} aria-controls="roi-results-panel" onClick={() => changeView("results")}>{u.results}{!valid && " *"}</button>
    </div>
    <div className={styles.printOnly}><h2>{t.printTitle}</h2><p>Block Consult · {t.title}</p><p>{model.title}</p><p className={styles.authored}>{model.notes}</p></div>
    <div className={styles.layout}>
      <aside id="roi-inputs-panel" className={`${styles.editor} ${styles.noPrint}`} aria-label={t.assumptions}>
        <div className={styles.sectionHeading}><h2>{u.inputs}</h2><span>{t.scenarios[selected]}</span></div>
        <section className={styles.inputGroup}><h3>{u.workflow}</h3><p>{u.workload}</p><div className={styles.fieldGrid}>{(Object.keys(commonRules) as CommonKey[]).map(field)}</div></section>
        <section className={styles.inputGroup}><h3>{u.automation}</h3><p>{u.automationNote}</p><div className={styles.fieldGrid}>{(["adoption", "coverage", "residual", "review"] as const).map(field)}</div></section>
        <section className={styles.inputGroup}><h3>{u.cashTitle}</h3>{field("realization")}<p>{u.cashNote}</p></section>
        <details className={styles.inputDetails}><summary><span>{u.costs}</span><small>{costsValid ? `${money(scenario.setup)} ${u.once} · ${money(scenario.software + scenario.usage + scenario.maintenance)} ${u.perMonth}` : u.check}</small></summary><div className={styles.fieldGrid}>{(["setup", "software", "usage", "maintenance"] as const).map(field)}</div><p>{t.costHelp}</p></details>
        <details className={styles.inputDetails}><summary><span>{u.timing}</span><small>{timingValid ? `${u.fieldLabels.delay}: ${f.n(scenario.delay)} · ${u.fieldLabels.ramp}: ${f.n(scenario.ramp)} ${t.months}` : u.check}</small></summary><div className={styles.fieldGrid}>{field("delay")}{field("ramp")}</div><p>{u.timingNote}</p></details>
        <details className={styles.inputDetails}><summary>{u.details}</summary><p>{u.notesHint}</p><div className={styles.field}><label htmlFor="roi-title">{t.name}</label><input id="roi-title" maxLength={120} value={model.title} disabled={disabled} onChange={event => edit({ ...model, title: event.target.value })} /></div><div className={styles.field}><label htmlFor="roi-notes">{t.notes}</label><textarea id="roi-notes" maxLength={2000} rows={4} disabled={disabled} value={model.notes} onChange={event => edit({ ...model, notes: event.target.value })} /></div></details>
        <button type="button" className={`${styles.primary} ${styles.mobileAction}`} onClick={() => changeView("results")}>{valid ? u.viewResults : u.fix} →</button>
      </aside>
      <div id="roi-results-panel" className={styles.resultArea}>
        {valid ? <Results model={model} locale={locale} selected={selected} /> : <section className={styles.invalid} role="alert"><h2>{u.fix}</h2><p>{t.invalidInputs}</p><ul>{issues.map(issue => <li key={`${issue.scenario}-${issue.key}`}><button type="button" onClick={() => focusIssue(issue)}>{issue.label} →</button></li>)}</ul></section>}
      </div>
    </div>
    <details className={`${styles.panel} ${styles.methodology}`}><summary>{t.methodology}</summary><p>{t.version} {model.methodologyVersion} · {t.schema} {model.schemaVersion}</p>{t.methodologyText.map(p => <p key={p}>{p}</p>)}</details>
    <dialog ref={dialogRef} className={`${styles.shareDialog} ${styles.noPrint}`} aria-labelledby="roi-share-title" onClose={() => { setPreview(false); shareRef.current?.focus({ preventScroll: true }); }}>
      {preview && valid && <><div className={styles.dialogHeading}><h2 id="roi-share-title" tabIndex={-1}>{t.shareTitle}</h2><button className={styles.button} type="button" aria-label={t.close} onClick={() => setPreview(false)}>×</button></div>
        <p>{u.shareIncluded} · {model.currency}. {u.sharePublic}</p><label className={styles.check}><input type="checkbox" checked={includeText} onChange={event => { setIncludeText(event.target.checked); setLink(""); }} />{t.includeText}</label><p>{includeText ? t.textIncluded : u.shareExcluded}</p>
        {includeText && <p className={styles.authored}>{model.title}<br />{model.notes}</p>}
        <details className={styles.panel}><summary>{t.previewInputs}</summary><Assumptions model={shareModel(model, includeText)} locale={locale} /></details>
        <div className={styles.toolbar}><button className={styles.primary} type="button" onClick={createLink}>{t.createLink}</button></div>
        {link && <div className={styles.field}><label htmlFor="roi-share-link">{t.linkLabel}</label><textarea id="roi-share-link" readOnly value={link} onFocus={event => event.target.select()} rows={3} /><button className={styles.button} type="button" onClick={() => void copyLink()}>{t.copyLink}</button></div>}
        <p role="status" aria-live="polite">{notice ? t.notices[notice] : `${t.schema} ${model.schemaVersion} · ${t.version} ${model.methodologyVersion}`}</p>
        {notice === "large" && <button className={styles.button} type="button" onClick={json}>{t.export}</button>}
      </>}
    </dialog>
  </div>;
}

import { ToolHeader } from "@/components/tools/ToolHeader";
import { Container } from "@/components/Container";
import { localeHref } from "@/content/i18n";
import { Tool } from "@/tools/ai-roi/Tool";
import { copy } from "@/tools/ai-roi/copy";
import { designCopy } from "@/tools/ai-roi/design-copy";
import { manifest } from "@/tools/ai-roi/manifest";
import styles from "@/tools/ai-roi/tool.module.css";

export default function Page({ locale }: { locale: 'en' | 'de' }) {
  const t = copy[locale];
  return <><ToolHeader tool="ai-roi" locale={locale} title={t.hero} lead={designCopy[locale].lead} printTitle /><Container><Tool locale={locale} /><section className={styles.services}><h2>{t.services}</h2><a href={localeHref(locale, "/services/ai-readiness")}>{t.readiness} →</a><a href={localeHref(locale, "/services/custom-ai-tools")}>{t.custom} →</a><a href={localeHref(locale, "/services/ai-care")}>{locale === "de" ? "Laufende KI-Betreuung" : "Ongoing AI care"} →</a></section></Container></>;
}

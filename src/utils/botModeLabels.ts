import type { BotMode } from "../types";

/** Persisted mode values keep the legacy `Avarage` spelling for compatibility. */
export function normalizeBotMode(value: unknown, fallback: BotMode = "Avarage Only"): BotMode {
  const raw = String(value ?? "").trim();
  if (raw === "Grid Only") return "Grid Only";
  if (raw === "Avarage+Grid" || raw === "Average+Grid" || raw === "Average + Grid") return "Avarage+Grid";
  if (raw === "Avarage Only" || raw === "Average Only") return "Avarage Only";
  return fallback;
}

export type BotModeLabelLanguage = "id" | "en" | "zh" | "hi" | "es" | "ar";

const labels: Record<BotModeLabelLanguage, Record<BotMode, string>> = {
  id: { "Avarage Only": "Average Only", "Grid Only": "Grid Only", "Avarage+Grid": "Average + Grid" },
  en: { "Avarage Only": "Average Only", "Grid Only": "Grid Only", "Avarage+Grid": "Average + Grid" },
  zh: { "Avarage Only": "平均模式", "Grid Only": "网格模式", "Avarage+Grid": "平均 + 网格" },
  hi: { "Avarage Only": "औसत मोड", "Grid Only": "ग्रिड मोड", "Avarage+Grid": "औसत + ग्रिड" },
  es: { "Avarage Only": "Promedio", "Grid Only": "Cuadrícula", "Avarage+Grid": "Promedio + Cuadrícula" },
  ar: { "Avarage Only": "متوسط", "Grid Only": "شبكة", "Avarage+Grid": "متوسط + شبكة" },
};

export function getBotModeLabel(value: unknown, language: BotModeLabelLanguage = "id"): string {
  const mode = normalizeBotMode(value);
  return labels[language]?.[mode] ?? labels.id[mode];
}

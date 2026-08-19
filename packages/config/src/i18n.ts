/**
 * Languages the product speaks.
 *
 * Multilingual output is a functional requirement, not a preference: the
 * broadcast pipeline carries a per-language copy of every announcement, and the
 * AI assistant is told which language to answer in. The set here is the
 * authority: `backend/validators/agent.validator.js` accepts exactly these
 * codes, and the citizen app's string table is keyed by them.
 */

export const LANGUAGES = ["en", "hi", "or"] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export interface LanguageMeta {
  readonly code: LanguageCode;
  /** Short label for a toggle — the script itself, not a translation. */
  readonly short: string;
  /** The language's name written in that language. Never in English. */
  readonly native: string;
  /** English name, for a secondary line only. */
  readonly english: string;
}

export const LANGUAGE_META: readonly LanguageMeta[] = [
  { code: "en", short: "EN", native: "English", english: "English" },
  { code: "hi", short: "हि", native: "हिन्दी", english: "Hindi" },
  { code: "or", short: "ଓଡ଼", native: "ଓଡ଼ିଆ", english: "Odia" },
];

/**
 * The account-level language names the User model stores. Different vocabulary
 * from the UI codes above (the signup validator accepts these words), so the
 * mapping lives here rather than being guessed at each call site.
 */
export const ACCOUNT_LANGUAGES = ["English", "Hindi", "Odia", "Other"] as const;
export type AccountLanguage = (typeof ACCOUNT_LANGUAGES)[number];

export const toAccountLanguage = (code: LanguageCode): AccountLanguage => {
  switch (code) {
    case "hi":
      return "Hindi";
    case "or":
      return "Odia";
    default:
      return "English";
  }
};

export const fromAccountLanguage = (name: string | null | undefined): LanguageCode => {
  switch (name) {
    case "Hindi":
      return "hi";
    case "Odia":
      return "or";
    default:
      return DEFAULT_LANGUAGE;
  }
};

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);

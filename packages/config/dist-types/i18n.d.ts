/**
 * Languages the product speaks.
 *
 * Multilingual output is a functional requirement, not a preference: the
 * broadcast pipeline carries a per-language copy of every announcement, and the
 * AI assistant is told which language to answer in. The set here is the
 * authority: `backend/validators/agent.validator.js` accepts exactly these
 * codes, and the citizen app's string table is keyed by them.
 */
export declare const LANGUAGES: readonly ["en", "hi", "or"];
export type LanguageCode = (typeof LANGUAGES)[number];
export declare const DEFAULT_LANGUAGE: LanguageCode;
export interface LanguageMeta {
    readonly code: LanguageCode;
    /** Short label for a toggle — the script itself, not a translation. */
    readonly short: string;
    /** The language's name written in that language. Never in English. */
    readonly native: string;
    /** English name, for a secondary line only. */
    readonly english: string;
}
export declare const LANGUAGE_META: readonly LanguageMeta[];
/**
 * The account-level language names the User model stores. Different vocabulary
 * from the UI codes above (the signup validator accepts these words), so the
 * mapping lives here rather than being guessed at each call site.
 */
export declare const ACCOUNT_LANGUAGES: readonly ["English", "Hindi", "Odia", "Other"];
export type AccountLanguage = (typeof ACCOUNT_LANGUAGES)[number];
export declare const toAccountLanguage: (code: LanguageCode) => AccountLanguage;
export declare const fromAccountLanguage: (name: string | null | undefined) => LanguageCode;
export declare const isLanguageCode: (value: unknown) => value is LanguageCode;

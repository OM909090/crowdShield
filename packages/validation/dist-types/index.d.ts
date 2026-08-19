/**
 * @crowdshield/validation — client-side mirrors of the backend validators.
 *
 * The server remains the authority on every rule here. These exist so a phone
 * can reject an obviously-bad form before spending a round trip on it, and so a
 * field rename shows up as a type error in both clients rather than a 422 in the
 * field. If one of these ever disagrees with `backend/validators/*.js`, the
 * backend is right and this is the bug.
 */
export * from "./auth";
export * from "./citizen";
import { z } from "zod";
/**
 * Flatten a Zod failure into `{ field: message }` — the shape the existing forms
 * already consume, and close to the backend's own `details` array.
 */
export declare function fieldErrors(error: z.ZodError): Record<string, string>;
export type ValidationResult<T> = {
    readonly ok: true;
    readonly data: T;
} | {
    readonly ok: false;
    readonly errors: Record<string, string>;
};
/** Parse without throwing, in the shape a form wants. */
export declare function validate<S extends z.ZodType>(schema: S, input: unknown): ValidationResult<z.output<S>>;

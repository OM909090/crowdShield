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
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly errors: Record<string, string> };

/** Parse without throwing, in the shape a form wants. */
export function validate<S extends z.ZodType>(
  schema: S,
  input: unknown
): ValidationResult<z.output<S>> {
  const result = schema.safeParse(input);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, errors: fieldErrors(result.error) };
}

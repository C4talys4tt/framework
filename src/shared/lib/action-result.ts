import type { z } from "zod";

/** The shape every server action returns, so clients handle failure uniformly. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(message: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return fieldErrors ? { ok: false, message, fieldErrors } : { ok: false, message };
}

/** First validation message per top-level field. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}

export function invalid(error: z.ZodError): ActionResult<never> {
  return fail("Check the highlighted fields.", fieldErrorsFrom(error));
}

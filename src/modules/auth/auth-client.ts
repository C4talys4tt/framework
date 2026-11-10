"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Browser client for the auth API mounted at /api/auth. Credentials are sent
 * to that route (rather than through server actions) so the auth library's
 * rate limiting applies to every attempt.
 */
export const authClient = createAuthClient();

type AuthError = { code?: string; message?: string; status?: number };

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match an account.",
  USER_ALREADY_EXISTS: "An account with this email already exists. Sign in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists. Sign in instead.",
  INVALID_PASSWORD: "Your current password is incorrect.",
  PASSWORD_TOO_SHORT: "That password is too short.",
  PASSWORD_TOO_LONG: "That password is too long.",
  INVALID_EMAIL: "Enter a valid email address.",
  INVALID_NAME: "Enter a name of at most 60 characters.",
};

/** Turns an auth API error into a sentence that is safe to show. */
export function describeAuthError(error: AuthError): string {
  if (error.status === 429) return "Too many attempts. Wait a moment and try again.";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]!;
  return "Something went wrong on our side. Try again.";
}

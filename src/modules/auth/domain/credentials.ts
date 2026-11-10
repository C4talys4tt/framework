import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MAX_LENGTH = 60;

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(NAME_MAX_LENGTH, `Keep your name under ${NAME_MAX_LENGTH} characters.`);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: newPasswordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: "Choose a password you are not already using.",
  });

export const profileSchema = z.object({ name: nameSchema });

/**
 * Where to send someone after signing in. Only same-origin absolute paths are
 * accepted, so a crafted `?next=` can never redirect off-site.
 */
export function safeRedirectPath(candidate: string | null | undefined, fallback = "/"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(candidate)) return fallback;
  return candidate;
}

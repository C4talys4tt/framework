import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { getPool } from "@/infrastructure/db/pool";
import { getEnv } from "@/infrastructure/env";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, nameSchema } from "../domain/credentials";
import { authSchema } from "./auth-schema";

/**
 * The browser validates names too, but the auth API can be called directly,
 * so the rule is enforced again here before anything is written.
 */
function withValidName<T extends { name?: string }>(user: T): { data: T } {
  if (user.name === undefined) return { data: user };
  const parsed = nameSchema.safeParse(user.name);
  if (!parsed.success) {
    throw new APIError("BAD_REQUEST", { code: "INVALID_NAME", message: parsed.error.issues[0]?.message ?? "Invalid name." });
  }
  return { data: { ...user, name: parsed.data } };
}

function createAuth() {
  const env = getEnv();
  const rateLimitEnabled =
    env.AUTH_RATE_LIMIT === undefined ? env.NODE_ENV === "production" : env.AUTH_RATE_LIMIT === "true";

  return betterAuth({
    database: getPool(),
    baseURL: env.APP_URL,
    secret: env.AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // Email delivery is not part of M1, so verification and password reset
      // are not offered. See docs/adr/0003-authentication.md.
      requireEmailVerification: false,
    },
    user: authSchema.user,
    session: {
      ...authSchema.session,
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    account: authSchema.account,
    verification: authSchema.verification,
    rateLimit: {
      ...authSchema.rateLimit,
      enabled: rateLimitEnabled,
      storage: "database",
    },
    databaseHooks: {
      user: {
        create: { before: async (user) => withValidName(user) },
        update: { before: async (user) => withValidName(user) },
      },
    },
    advanced: {
      cookiePrefix: "framework",
      database: { generateId: "uuid" },
    },
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & { __frameworkAuth?: Auth };

/** Lazily constructed so importing this module never requires configuration. */
export function getAuth(): Auth {
  globalForAuth.__frameworkAuth ??= createAuth();
  return globalForAuth.__frameworkAuth;
}

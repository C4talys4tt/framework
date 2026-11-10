import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters. Generate one with `openssl rand -base64 32`."),
  APP_URL: z.url({ protocol: /^https?$/ }),
  /**
   * Auth endpoints are rate limited in production by default. This switch exists
   * so automated browser tests can run against a production build; never set it
   * to "false" on a real deployment.
   */
  AUTH_RATE_LIMIT: z.enum(["true", "false"]).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validated server environment. Parsed lazily so `next build` can import
 * server modules without a database or secrets being present.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

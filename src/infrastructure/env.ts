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

  /**
   * Where uploaded files go (M3). "filesystem" writes under STORAGE_DIR and suits local
   * development or a single server with a persistent disk. "s3" uses any S3-compatible bucket.
   */
  STORAGE_DRIVER: z.enum(["filesystem", "s3"]).default("filesystem"),
  STORAGE_DIR: z.string().min(1).default(".storage"),
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default("auto"),
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
  S3_PREFIX: z
    .string()
    .regex(/^([a-z0-9_-]+\/)*$/, "S3_PREFIX must be empty or end with a slash, e.g. production/")
    .default(""),
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

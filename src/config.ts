import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  [${i.path.join(".")}] ${i.message}`)
    .join("\n");
  throw new Error(`Configuration error:\n${issues}`);
}

export const config = parsed.data;

/**
 * Runtime knobs for the Sierra demo. Per TDD § 15.A — env-tunable, not
 * hard-coded. Defaults are the demo-safe values; override per environment.
 */
export const CONFIG = {
  modelId: process.env.SIERRA_MODEL_ID ?? 'claude-sonnet-4-5',
  rateLimitPerMin: Number(process.env.SIERRA_RATE_LIMIT_PER_MIN ?? 10),
  dailyCapUsd: Number(process.env.SIERRA_DAILY_CAP_USD ?? 5.0),
  stopAfterSteps: Number(process.env.SIERRA_STOP_AFTER_STEPS ?? 20),
} as const;

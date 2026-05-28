/**
 * Daily-cap budget tracker (TDD § 14). Each turn's token usage is charged
 * to a calendar-day Redis key with the Claude Sonnet 4.5 unit prices.
 * `exceeded()` returns true once the cumulative spend crosses
 * `CONFIG.dailyCapUsd`, at which point the route returns a 503 instead of
 * starting a new turn.
 *
 * `IN_PRICE` / `OUT_PRICE` are USD per token (Sonnet 4.5: $3/MTok input,
 * $15/MTok output). The TTL bump on first charge is a 36-hour safety
 * window so the key reliably expires after the calendar day rolls.
 */

import { Redis } from '@upstash/redis';
import { CONFIG } from './config';

const redis = Redis.fromEnv();
const IN_PRICE = 3 / 1_000_000;
const OUT_PRICE = 15 / 1_000_000;

const dayKey = (): string => `sierra:spend:${new Date().toISOString().slice(0, 10)}`;

export const dailyBudget = {
  async exceeded(): Promise<boolean> {
    const spent = (await redis.get<number>(dayKey())) ?? 0;
    return spent >= CONFIG.dailyCapUsd;
  },
  async charge(inputTokens: number, outputTokens: number): Promise<void> {
    const cost = inputTokens * IN_PRICE + outputTokens * OUT_PRICE;
    if (cost <= 0) return;
    const key = dayKey();
    const total = await redis.incrbyfloat(key, cost);
    // First charge of the day creates the key; set TTL so it eventually
    // expires. Detect "first charge" by checking the post-incr total is
    // (within float epsilon) equal to the cost we just added.
    if (typeof total === 'number' && Math.abs(total - cost) < 1e-9) {
      await redis.expire(key, 60 * 60 * 36);
    }
  },
};

/**
 * Per-IP sliding-window rate limiter backed by Upstash Redis.
 * Configured per TDD § 13. The window length and request quota come from
 * `CONFIG.rateLimitPerMin`; the limiter is allocated once at module load
 * so it is reused across warm-Lambda invocations.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { CONFIG } from './config';

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(CONFIG.rateLimitPerMin, '1 m'),
  analytics: true,
  prefix: 'sierra:rl',
});

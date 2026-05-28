/**
 * Structured-log helper for the Sierra demo (TDD § 17).
 *
 * Hard rule: NEVER log message content or tool inputs that could contain
 * user payment IDs, names, etc. Only emit metadata — session id, IP hash,
 * token counts, durations, status. IPs are SHA-256 hashed and truncated
 * to 16 hex chars before logging.
 */

import { createHash } from 'node:crypto';

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

interface LogEvent {
  event: string;
  [k: string]: unknown;
}

export function log(e: LogEvent): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...e }));
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Loads the τ-airline policy doc. Reads on first call only (memoized).
 * Lazy so Next.js static analysis doesn't fault on a top-level fs read.
 * Server-only — do not import from a client component.
 */
let _wiki: string | null = null;

export function getAirlineWiki(): string {
  if (_wiki === null) {
    _wiki = readFileSync(join(process.cwd(), 'app/sierra/data/wiki.md'), 'utf-8');
  }
  return _wiki;
}

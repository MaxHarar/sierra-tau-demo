/**
 * Canonical task expectations for the Sierra eval (TDD § 12).
 *
 * Each task mirrors one of the five user-facing chips in `content/sierra/chips.ts`
 * but with a `judge(world)` function baked in. The judge inspects the final
 * `AirlineWorld` (specifically `world.actions`, the append-only mutating-tool
 * log produced by `lib/sierra/tools.ts`) and returns a binary pass/fail.
 *
 * The judges are deliberately narrow — they check the *minimum* observable
 * commitment the agent made (a specific mutating call or, for refusal tasks,
 * the absence of any mutating call). They do NOT score conversational style
 * or partial credit. Pass^1 from these judges is what `app/sierra/data/pass1.json`
 * stores and the /sierra page renders.
 */

import type { AirlineWorld } from '@/lib/sierra/types';
import { CHIPS } from '@/content/sierra/chips';

export interface CanonicalTask {
  /** Stable slug used as the key in `pass1.json` and the URL fragment on /sierra. */
  id: string;
  /** Display label — must match the corresponding chip label. */
  label: string;
  /** Verbatim user prompt — must match the corresponding chip prompt. */
  prompt: string;
  /** Judge function returning pass + a short human-readable reason. */
  judge: (world: AirlineWorld) => { pass: boolean; reason: string };
}

function lastAction(world: AirlineWorld, name: string) {
  return [...world.actions].reverse().find((a) => a.name === name);
}

function hasNoMutatingActions(world: AirlineWorld): boolean {
  const mutating = new Set([
    'update_reservation_flights',
    'update_reservation_baggages',
    'cancel_reservation',
  ]);
  return !world.actions.some((a) => mutating.has(a.name));
}

export const CANONICAL_TASKS: CanonicalTask[] = [
  {
    id: 'change_flight_to_lax',
    label: CHIPS[0].label,
    prompt: CHIPS[0].prompt,
    // Mia Li (mia_li_3668) — agent must call update_reservation_flights and
    // the new itinerary must include a flight whose origin or destination is LAX.
    judge: (world) => {
      const act = lastAction(world, 'update_reservation_flights');
      if (!act) return { pass: false, reason: 'no update_reservation_flights call' };
      const rid = (act.kwargs as { reservation_id?: string }).reservation_id;
      const r = rid ? world.reservations[rid] : undefined;
      if (!r) return { pass: false, reason: 'reservation not found post-update' };
      const goesToLax = r.flights.some((f) => f.destination === 'LAX' || f.origin === 'LAX');
      return goesToLax
        ? { pass: true, reason: 'update_reservation_flights with LAX leg' }
        : { pass: false, reason: 'updated but no LAX leg' };
    },
  },
  {
    id: 'cancel_reservation_4wq150',
    label: CHIPS[1].label,
    prompt: CHIPS[1].prompt,
    // Chen Jackson — agent must call cancel_reservation with reservation_id 4WQ150.
    judge: (world) => {
      const act = lastAction(world, 'cancel_reservation');
      if (!act) return { pass: false, reason: 'no cancel_reservation call' };
      const rid = (act.kwargs as { reservation_id?: string }).reservation_id;
      return rid === '4WQ150'
        ? { pass: true, reason: 'cancel_reservation(4WQ150)' }
        : { pass: false, reason: `cancel_reservation called on ${rid}, not 4WQ150` };
    },
  },
  {
    id: 'first_class_refusal',
    label: CHIPS[2].label,
    prompt: CHIPS[2].prompt,
    // Calibrated refusal — policy forbids free upgrades. Agent MUST NOT take
    // any mutating action; the right answer is conversational refusal.
    judge: (world) =>
      hasNoMutatingActions(world)
        ? { pass: true, reason: 'no mutating actions (refused)' }
        : { pass: false, reason: 'agent took a mutating action when it should have refused' },
  },
  {
    id: 'flight_status_lookup',
    label: CHIPS[3].label,
    prompt: CHIPS[3].prompt,
    // Lookup only — answer comes from read tools, no mutations should occur.
    judge: (world) =>
      hasNoMutatingActions(world)
        ? { pass: true, reason: 'no mutating actions (read-only)' }
        : { pass: false, reason: 'agent mutated when it should have just looked up' },
  },
  {
    id: 'contradiction_handle',
    label: CHIPS[4].label,
    prompt: CHIPS[4].prompt,
    // Contradiction — refund-but-keep-seat is impossible. Agent should ask
    // for clarification or refuse, not mutate.
    judge: (world) =>
      hasNoMutatingActions(world)
        ? { pass: true, reason: 'no mutating actions (handled contradiction)' }
        : { pass: false, reason: 'agent mutated despite contradictory request' },
  },
];

import { createHash } from 'node:crypto';
import type { UIMessage } from 'ai';
import usersJson from '@/app/sierra/data/users.json';
import flightsJson from '@/app/sierra/data/flights.json';
import reservationsJson from '@/app/sierra/data/reservations.json';
import { log } from './log';
import type {
  AirlineWorld,
  Cabin,
  Flight,
  Reservation,
  ReservationFlight,
  User,
} from './types';

/**
 * Tool names whose `execute()` mutates the world. Read-only tools
 * (search_*, get_*, calculate) are NOT in this set — replaying them
 * during world rebuild would be no-ops.
 */
const MUTATING_TOOLS = new Set<string>([
  'update_reservation_flights',
  'update_reservation_baggages',
  'cancel_reservation',
]);

/**
 * Stateless-by-rehydration world builder (TDD § 3.2). Vercel serverless
 * functions don't share process memory, so the canonical state is the
 * message history `useChat()` ships on every POST. Mutating tool calls
 * are replayed against a fresh corpus clone to reconstruct the current
 * world deterministically.
 */
export function buildWorld(messages: UIMessage[]): AirlineWorld {
  const world: AirlineWorld = {
    users: structuredClone(usersJson as unknown as Record<string, User>),
    flights: structuredClone(flightsJson as unknown as Record<string, Flight>),
    reservations: structuredClone(reservationsJson as unknown as Record<string, Reservation>),
    actions: [],
  };

  for (const m of messages) {
    const parts = (m as { parts?: Array<Record<string, unknown>> }).parts;
    if (!parts) continue;
    for (const part of parts) {
      const type = part.type as string | undefined;
      const state = part.state as string | undefined;
      if (!type?.startsWith('tool-') || state !== 'output-available') continue;
      const name = type.slice('tool-'.length);
      if (!MUTATING_TOOLS.has(name)) continue;
      applyMutation(world, name, part.input as Record<string, unknown>);
    }
  }

  return world;
}

/**
 * Minimal mutation replay. The canonical tool logic lives in
 * lib/sierra/tools.ts (Chunk 2); this exists so a freshly-built world
 * matches the state at the end of the message history.
 */
function applyMutation(world: AirlineWorld, name: string, input: Record<string, unknown>): void {
  switch (name) {
    case 'cancel_reservation': {
      const id = input.reservation_id as string | undefined;
      if (!id || !world.reservations[id]) {
        log({ event: 'world_replay_skip', name, reason: 'reservation_not_found' });
        return;
      }
      delete world.reservations[id];
      world.actions.push({ name, kwargs: input, at: Date.now() });
      return;
    }
    case 'update_reservation_flights': {
      const id = input.reservation_id as string | undefined;
      const cabin = input.cabin as Cabin | undefined;
      const flights = input.flights as Array<{ flight_number: string; date: string }> | undefined;
      if (!id || !cabin || !flights) {
        log({ event: 'world_replay_skip', name, reason: 'missing_required_input' });
        return;
      }
      const r = world.reservations[id];
      if (!r) {
        log({ event: 'world_replay_skip', name, reason: 'reservation_not_found' });
        return;
      }
      r.cabin = cabin;
      r.flights = flights.map<ReservationFlight>((f) => {
        const flight = world.flights[f.flight_number];
        return {
          flight_number: f.flight_number,
          date: f.date,
          origin: flight?.origin ?? '',
          destination: flight?.destination ?? '',
          price: flight?.dates?.[f.date]?.prices?.[cabin] ?? 0,
        };
      });
      world.actions.push({ name, kwargs: input, at: Date.now() });
      return;
    }
    case 'update_reservation_baggages': {
      const id = input.reservation_id as string | undefined;
      const total = input.total_baggages as number | undefined;
      const nonfree = input.nonfree_baggages as number | undefined;
      if (!id) {
        log({ event: 'world_replay_skip', name, reason: 'missing_reservation_id' });
        return;
      }
      const r = world.reservations[id];
      if (!r) {
        log({ event: 'world_replay_skip', name, reason: 'reservation_not_found' });
        return;
      }
      if (typeof total === 'number') r.total_baggages = total;
      if (typeof nonfree === 'number') r.nonfree_baggages = nonfree;
      world.actions.push({ name, kwargs: input, at: Date.now() });
      return;
    }
    default: {
      log({ event: 'world_replay_skip', name, reason: 'unknown_mutation' });
      return;
    }
  }
}

// Warm-Lambda cache. NOT a correctness mechanism — purely a perf
// optimization so the same session within one Lambda doesn't rebuild
// from scratch every turn. Hash includes the full message history;
// any change rebuilds.
const cache = new Map<string, { hash: string; world: AirlineWorld }>();

export function getWorld(sessionId: string, messages: UIMessage[]): AirlineWorld {
  const hash = hashMessages(messages);
  const hit = cache.get(sessionId);
  if (hit?.hash === hash) return hit.world;
  const world = buildWorld(messages);
  cache.set(sessionId, { hash, world });
  return world;
}

function hashMessages(messages: UIMessage[]): string {
  return createHash('sha1').update(JSON.stringify(messages)).digest('hex');
}

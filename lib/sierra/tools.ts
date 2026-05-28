/**
 * Sierra v1 airline-tool catalog. Eight tools implementing the τ-airline
 * surface (TDD § 6). Each `execute()`:
 *
 * - is async
 * - returns plain JSON-serializable objects only
 * - NEVER throws — wraps risky ops in try/catch and returns `{ error }`
 * - closes over the session's `AirlineWorld` reference passed by the factory
 *
 * Mutating tools (update_reservation_flights, cancel_reservation,
 * update_reservation_baggages) append a `WorldAction` so the eval scorer
 * in Chunk 3 can deep-equal the action sequence against canonical task
 * expectations. Read tools (get_*, search_*, calculate) do not.
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { AirlineWorld, Cabin, ReservationFlight } from './types';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const getUserSchema = z.object({
  user_id: z.string().describe('User identifier, e.g. "mia_li_3668".'),
});

const getReservationSchema = z.object({
  reservation_id: z.string().describe('Reservation identifier, e.g. "4WQ150".'),
});

const searchFlightSchema = z.object({
  origin: z.string().length(3).describe('Origin airport IATA code (3 letters).'),
  destination: z.string().length(3).describe('Destination airport IATA code (3 letters).'),
  date: z.string().regex(dateRegex).describe('Travel date in YYYY-MM-DD format.'),
});

const updateReservationFlightsSchema = z.object({
  reservation_id: z.string(),
  cabin: z.enum(['basic_economy', 'economy', 'business']),
  flights: z.array(
    z.object({
      flight_number: z.string(),
      date: z.string().regex(dateRegex),
    }),
  ),
  payment_id: z.string(),
});

const cancelReservationSchema = z.object({
  reservation_id: z.string(),
});

const updateBaggagesSchema = z.object({
  reservation_id: z.string(),
  total_baggages: z.number().int().min(0),
  nonfree_baggages: z.number().int().min(0),
  payment_id: z.string(),
});

const calculateSchema = z.object({
  expression: z
    .string()
    .min(1)
    .max(256)
    .describe('Arithmetic expression using only digits, + - * / ( ) and decimal points.'),
});

// ---------------------------------------------------------------------------
// Safe arithmetic evaluator
// ---------------------------------------------------------------------------

const SAFE_EXPR = /^[\d+\-*/().\s]+$/;

/**
 * Recursive-descent parser for the grammar:
 *   expr   := term (('+'|'-') term)*
 *   term   := factor (('*'|'/') factor)*
 *   factor := number | '(' expr ')' | ('+'|'-') factor
 *   number := digits ('.' digits)?
 *
 * Used by the `calculate` tool so we never need `eval()` / `new Function()`.
 * The input is also pre-validated by `SAFE_EXPR`; this parser is the
 * second line of defense.
 */
function safeEvaluate(expression: string): number {
  let i = 0;
  const s = expression;

  const skipSpace = (): void => {
    while (i < s.length && /\s/.test(s[i] as string)) i++;
  };

  const parseNumber = (): number => {
    skipSpace();
    const start = i;
    while (i < s.length && /[\d.]/.test(s[i] as string)) i++;
    const slice = s.slice(start, i);
    if (slice === '' || slice === '.') throw new Error('expected number');
    const n = Number(slice);
    if (!Number.isFinite(n)) throw new Error('invalid number');
    return n;
  };

  const parseFactor = (): number => {
    skipSpace();
    if (s[i] === '+') {
      i++;
      return parseFactor();
    }
    if (s[i] === '-') {
      i++;
      return -parseFactor();
    }
    if (s[i] === '(') {
      i++;
      const v = parseExpr();
      skipSpace();
      if (s[i] !== ')') throw new Error("expected ')'");
      i++;
      return v;
    }
    return parseNumber();
  };

  const parseTerm = (): number => {
    let v = parseFactor();
    while (true) {
      skipSpace();
      const op = s[i];
      if (op !== '*' && op !== '/') break;
      i++;
      const r = parseFactor();
      if (op === '*') v = v * r;
      else {
        if (r === 0) throw new Error('division by zero');
        v = v / r;
      }
    }
    return v;
  };

  const parseExpr = (): number => {
    let v = parseTerm();
    while (true) {
      skipSpace();
      const op = s[i];
      if (op !== '+' && op !== '-') break;
      i++;
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };

  const result = parseExpr();
  skipSpace();
  if (i !== s.length) throw new Error('unexpected trailing characters');
  if (!Number.isFinite(result)) throw new Error('non-finite result');
  return result;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function airlineTools(world: AirlineWorld) {
  return {
    get_user_details: tool({
      description:
        'Get the full profile for a single user by their user_id, including saved payment methods, passengers, membership tier, and reservation list.',
      inputSchema: getUserSchema,
      execute: async ({ user_id }) => {
        const user = world.users[user_id];
        if (!user) return { error: 'user not found' };
        return user;
      },
    }),

    get_reservation_details: tool({
      description:
        'Get the full details of a single reservation by its reservation_id, including flights, passengers, cabin, baggage counts, and payment history.',
      inputSchema: getReservationSchema,
      execute: async ({ reservation_id }) => {
        const reservation = world.reservations[reservation_id];
        if (!reservation) return { error: 'reservation not found' };
        return reservation;
      },
    }),

    search_direct_flight: tool({
      description:
        'Search for available direct (non-stop) flights between two airports on a specific date. Returns flights with status "available" only.',
      inputSchema: searchFlightSchema,
      execute: async ({ origin, destination, date }) => {
        const matches = Object.values(world.flights).filter(
          (f) =>
            f.origin === origin &&
            f.destination === destination &&
            f.dates?.[date]?.status === 'available',
        );
        return { flights: matches };
      },
    }),

    search_onestop_flight: tool({
      description:
        'Search for available one-stop (single-connection) flight pairs between two airports on a specific date. Returns up to 20 [leg1, leg2] pairs where both legs are available on the given date.',
      inputSchema: searchFlightSchema,
      execute: async ({ origin, destination, date }) => {
        // Bucket all flights by origin so we can pivot on connecting airports.
        const flightsByOrigin = new Map<string, typeof world.flights[string][]>();
        for (const f of Object.values(world.flights)) {
          if (f.dates?.[date]?.status !== 'available') continue;
          const arr = flightsByOrigin.get(f.origin) ?? [];
          arr.push(f);
          flightsByOrigin.set(f.origin, arr);
        }

        const firstLegs = (flightsByOrigin.get(origin) ?? []).filter(
          (f) => f.destination !== destination,
        );

        const results: Array<[typeof world.flights[string], typeof world.flights[string]]> = [];
        for (const leg1 of firstLegs) {
          const connecting = flightsByOrigin.get(leg1.destination) ?? [];
          for (const leg2 of connecting) {
            if (leg2.destination !== destination) continue;
            results.push([leg1, leg2]);
            if (results.length >= 20) break;
          }
          if (results.length >= 20) break;
        }

        return { flights: results };
      },
    }),

    update_reservation_flights: tool({
      description:
        'Replace the flights on an existing reservation. Provide every flight that should be on the reservation after the update (this is not a delta). All flights must be available on the given dates.',
      inputSchema: updateReservationFlightsSchema,
      execute: async (input) => {
        const { reservation_id, cabin, flights } = input;
        const r = world.reservations[reservation_id];
        if (!r) return { error: 'reservation not found' };

        // Validate every requested flight exists in the world AND is
        // available on the requested date. Previously unknown flight
        // numbers silently produced price=0 ReservationFlight entries.
        for (const f of flights) {
          const flight = world.flights[f.flight_number];
          if (!flight) {
            return { error: `flight ${f.flight_number} not found` };
          }
          const dateEntry = flight.dates?.[f.date];
          if (!dateEntry) {
            return { error: `flight ${f.flight_number} not available on ${f.date}` };
          }
          if (dateEntry.status !== 'available') {
            return {
              error: `flight ${f.flight_number} on ${f.date} is ${dateEntry.status}, not available`,
            };
          }
        }

        const newFlights: ReservationFlight[] = flights.map((f) => {
          const flight = world.flights[f.flight_number];
          const price = flight?.dates?.[f.date]?.prices?.[cabin as Cabin] ?? 0;
          return {
            flight_number: f.flight_number,
            date: f.date,
            origin: flight?.origin ?? '',
            destination: flight?.destination ?? '',
            price,
          };
        });

        r.cabin = cabin as Cabin;
        r.flights = newFlights;

        world.actions.push({
          name: 'update_reservation_flights',
          kwargs: input as unknown as Record<string, unknown>,
          at: Date.now(),
        });

        return { reservation: r };
      },
    }),

    cancel_reservation: tool({
      description:
        'Cancel a reservation. Refunds the sum of all payment_history amounts back to the original payment source.',
      inputSchema: cancelReservationSchema,
      execute: async (input) => {
        const { reservation_id } = input;
        const r = world.reservations[reservation_id];
        if (!r) return { error: 'reservation not found' };

        const refundAmount = r.payment_history.reduce((sum, p) => sum + p.amount, 0);
        delete world.reservations[reservation_id];

        world.actions.push({
          name: 'cancel_reservation',
          kwargs: input as unknown as Record<string, unknown>,
          at: Date.now(),
        });

        return {
          ok: true,
          refund: { source: 'original_payment', amount: refundAmount },
        };
      },
    }),

    update_reservation_baggages: tool({
      description:
        'Update the total and non-free baggage counts on a reservation. Both values are absolute totals after the update, not deltas.',
      inputSchema: updateBaggagesSchema,
      execute: async (input) => {
        const { reservation_id, total_baggages, nonfree_baggages } = input;
        const r = world.reservations[reservation_id];
        if (!r) return { error: 'reservation not found' };

        r.total_baggages = total_baggages;
        r.nonfree_baggages = nonfree_baggages;

        world.actions.push({
          name: 'update_reservation_baggages',
          kwargs: input as unknown as Record<string, unknown>,
          at: Date.now(),
        });

        return { reservation: r };
      },
    }),

    calculate: tool({
      description:
        'Evaluate a basic arithmetic expression (digits, + - * / parentheses, decimals). Use this for any math you need instead of computing in your head.',
      inputSchema: calculateSchema,
      execute: async ({ expression }) => {
        if (!SAFE_EXPR.test(expression)) {
          return { error: 'invalid expression' };
        }
        try {
          const result = safeEvaluate(expression);
          return { result };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'evaluation failed';
          return { error: msg };
        }
      },
    }),
  };
}

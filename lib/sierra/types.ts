/**
 * Type definitions for the τ-airline corpus (sierra-research/tau2-bench, MIT).
 *
 * Shapes are documented in TDD-sierra.md § 3.1. Where the on-disk JSON
 * disagrees with the TDD prose, the comments below note the empirical
 * adjustment and the divergence is mirrored in PROVENANCE.md.
 */

// ---------------------------------------------------------------------------
// User-side records (users.json)
// ---------------------------------------------------------------------------

/**
 * A payment instrument stored on a user. The `source` discriminator selects
 * which sibling fields are meaningful:
 *
 * - `credit_card` → `brand` + `last_four`
 * - `certificate` → `amount`
 * - `gift_card`   → `amount`
 */
export interface PaymentMethod {
  source: 'credit_card' | 'certificate' | 'gift_card';
  id: string;
  // credit_card extras
  brand?: string;
  last_four?: string;
  // certificate / gift_card extras
  amount?: number;
}

export interface SavedPassenger {
  first_name: string;
  last_name: string;
  /** ISO date — `YYYY-MM-DD`. */
  dob: string;
}

export interface UserAddress {
  address1: string;
  /**
   * Always populated in the imported corpus (500/500 users) but kept optional
   * to match the TDD interface and tolerate future trimming upstream.
   */
  address2?: string;
  city: string;
  country: string;
  state: string;
  zip: string;
}

/**
 * Membership tier. `platinum` is documented in the upstream schema and
 * appears in TDD § 3.1, but does NOT occur in the current 500-user sample
 * (observed: `regular` × 143, `silver` × 182, `gold` × 175). Kept in the
 * union so any future data refresh that introduces it type-checks cleanly.
 */
export type Membership = 'regular' | 'silver' | 'gold' | 'platinum';

export interface User {
  name: { first_name: string; last_name: string };
  address: UserAddress;
  email: string;
  /** ISO date — `YYYY-MM-DD`. */
  dob: string;
  /** Keyed by `payment_method.id`. */
  payment_methods: Record<string, PaymentMethod>;
  saved_passengers: SavedPassenger[];
  membership: Membership;
  /** Reservation IDs owned by this user. */
  reservations: string[];
}

// ---------------------------------------------------------------------------
// Flight-side records (flights.json)
// ---------------------------------------------------------------------------

export type FlightStatus =
  | 'landed'
  | 'cancelled'
  | 'available'
  | 'delayed'
  | 'on time'
  | 'flying';

export type Cabin = 'basic_economy' | 'economy' | 'business';

/**
 * A single date entry in `flight.dates`. The available fields depend on
 * `status`:
 *
 * - `available`           → `available_seats` + `prices`
 * - `landed`              → `actual_departure_time_est` + `actual_arrival_time_est`
 * - `delayed` / `on time` → `estimated_*_time_est` (sometimes `actual_*` too)
 * - `flying`              → `estimated_arrival_time_est` (often `actual_departure_time_est`)
 * - `cancelled`           → typically no extra fields
 *
 * `estimated_*_time_est` are NOT in TDD § 3.1's prose example but DO appear
 * in the on-disk data; declared optional here so the world-loader does not
 * silently drop them.
 */
export interface FlightDateEntry {
  status: FlightStatus;
  actual_departure_time_est?: string;
  actual_arrival_time_est?: string;
  estimated_departure_time_est?: string;
  estimated_arrival_time_est?: string;
  available_seats?: Record<Cabin, number>;
  prices?: Record<Cabin, number>;
}

export interface Flight {
  flight_number: string;
  origin: string;
  destination: string;
  /** Local time-of-day `HH:MM:SS`, not a full ISO instant. */
  scheduled_departure_time_est: string;
  scheduled_arrival_time_est: string;
  /** Keyed by `YYYY-MM-DD` calendar date. */
  dates: Record<string, FlightDateEntry>;
}

// ---------------------------------------------------------------------------
// Reservation-side records (reservations.json)
// ---------------------------------------------------------------------------

export interface ReservationFlight {
  origin: string;
  destination: string;
  flight_number: string;
  /** ISO date — `YYYY-MM-DD`. */
  date: string;
  /** USD, per-passenger, fare paid at booking. */
  price: number;
}

export interface ReservationPassenger {
  first_name: string;
  last_name: string;
  /** ISO date — `YYYY-MM-DD`. */
  dob: string;
}

export interface PaymentHistoryEntry {
  /** Matches `User.payment_methods[*].id`. */
  payment_id: string;
  /** USD. Positive = charge, negative = refund. */
  amount: number;
}

export interface Reservation {
  reservation_id: string;
  /** FK into `users.json`. */
  user_id: string;
  origin: string;
  destination: string;
  flight_type: 'one_way' | 'round_trip';
  cabin: Cabin;
  flights: ReservationFlight[];
  passengers: ReservationPassenger[];
  payment_history: PaymentHistoryEntry[];
  /** ISO datetime (no timezone in corpus). */
  created_at: string;
  total_baggages: number;
  nonfree_baggages: number;
  insurance: 'yes' | 'no';
}

// ---------------------------------------------------------------------------
// Session-scoped world (TDD § 3.2 — "stateless-by-rehydration")
// ---------------------------------------------------------------------------

/**
 * One entry in the world's mutating-action log. Used by the eval scorer
 * (Chunk 3) to deep-equal compare an agent's action sequence against a
 * canonical task expectation.
 */
export interface WorldAction {
  /** Mutating tool name (e.g. `update_reservation_flights`). */
  name: string;
  /** Tool input that was validated by the Zod schema. */
  kwargs: Record<string, unknown>;
  /** `Date.now()` at the time the mutation was applied. */
  at: number;
}

export interface AirlineWorld {
  /** Keyed by `user_id` (e.g. `mia_li_3668`). */
  users: Record<string, User>;
  /** Keyed by `flight_number` (e.g. `HAT001`). */
  flights: Record<string, Flight>;
  /** Keyed by `reservation_id` (e.g. `4WQ150`). */
  reservations: Record<string, Reservation>;
  /** Append-only log of mutating tool calls applied to this world. */
  actions: WorldAction[];
}

'use client';

/**
 * Sierra itinerary / flow pane (TDD § 2 center pane).
 *
 * Walks the message history for the most recent tool-output payloads from
 * the read/write tools and renders a structured "what the agent currently
 * knows" panel. It is the answer to: "if I dropped into this conversation,
 * what state would I see?"
 *
 * Tools we read from (in priority order — last write wins):
 *
 *  - `get_user_details`           → user identity + membership badge
 *  - `get_reservation_details`    → reservation summary + flights + pax
 *  - `update_reservation_flights` → reflect the proposed/applied change
 *  - `cancel_reservation`         → render a CANCELLED stamp
 */

import type { UIMessage } from 'ai';
import type { Reservation, User } from '@/lib/sierra/types';

interface FlowPaneProps {
  messages: UIMessage[];
}

interface PartLike {
  type?: string;
  state?: string;
  output?: unknown;
  input?: unknown;
}

interface FlowState {
  user: User | null;
  reservation: Reservation | null;
  cancelled: boolean;
}

function extractFlowState(messages: UIMessage[]): FlowState {
  const out: FlowState = {
    user: null,
    reservation: null,
    cancelled: false,
  };

  for (const m of messages) {
    for (const rawPart of m.parts ?? []) {
      const part = rawPart as PartLike;
      if (part.state !== 'output-available') continue;
      if (typeof part.type !== 'string') continue;
      const name = part.type.startsWith('tool-')
        ? part.type.slice('tool-'.length)
        : null;
      if (!name) continue;
      const output = part.output as Record<string, unknown> | undefined;
      if (!output) continue;

      if (name === 'get_user_details') {
        // The tool returns the user object directly (or `{ error }`).
        if (!('error' in output)) {
          out.user = output as unknown as User;
        }
      } else if (name === 'get_reservation_details') {
        if (!('error' in output)) {
          out.reservation = output as unknown as Reservation;
          out.cancelled = false;
        }
      } else if (name === 'update_reservation_flights') {
        const r = (output as { reservation?: Reservation }).reservation;
        if (r) {
          out.reservation = r;
          out.cancelled = false;
        }
      } else if (name === 'cancel_reservation') {
        if (!('error' in output)) {
          out.cancelled = true;
        }
      }
    }
  }

  return out;
}

function MembershipBadge({ tier }: { tier: string }) {
  return (
    <span className="rounded-full border border-border bg-code-bg px-2 py-0.5 text-[10px] uppercase tracking-widest text-secondary">
      {tier}
    </span>
  );
}

export function FlowPane({ messages }: FlowPaneProps) {
  const { user, reservation, cancelled } = extractFlowState(messages);

  if (!user && !reservation) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center rounded-md border border-dashed border-border p-4">
        <p className="text-center text-xs italic text-tertiary">
          Itinerary will appear here as the agent works.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {user && (
        <section className="rounded-md border border-border bg-code-bg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-tertiary">
                Customer
              </p>
              <p className="font-heading text-sm font-semibold text-foreground">
                {user.name.first_name} {user.name.last_name}
              </p>
            </div>
            <MembershipBadge tier={user.membership} />
          </div>
        </section>
      )}

      {reservation && (
        <section className="rounded-md border border-border bg-code-bg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-tertiary">
                Reservation
              </p>
              <p className="font-mono text-sm text-foreground">
                {reservation.reservation_id}
                {cancelled && (
                  <span className="ml-2 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-red-500">
                    cancelled
                  </span>
                )}
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-widest text-secondary capitalize">
              {reservation.cabin.replace(/_/g, ' ')}
            </span>
          </div>

          <p className="mt-1 font-mono text-[11px] text-secondary">
            {reservation.origin} → {reservation.destination} ·{' '}
            {reservation.flight_type.replace('_', ' ')}
          </p>

          <div className="mt-3 space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-tertiary">
              Flights
            </p>
            {reservation.flights.map((f) => (
              <div
                key={`${f.flight_number}-${f.date}`}
                className="font-mono text-[11px] text-secondary"
              >
                <span className="text-foreground">[{f.flight_number}]</span>{' '}
                {f.origin} → {f.destination}{' '}
                <span className="text-tertiary">{f.date}</span>{' '}
                <span className="text-foreground">${f.price}</span>
              </div>
            ))}
          </div>

          {reservation.passengers.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-tertiary">
                Passengers
              </p>
              {reservation.passengers.map((p, i) => (
                <p key={i} className="text-[11px] text-secondary">
                  {p.first_name} {p.last_name}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

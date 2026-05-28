'use client';

/**
 * Sierra itinerary diff card (TDD § 11.5).
 *
 * Side-by-side "before vs after" view used when the agent proposes a
 * reservation change. The fare delta is rendered sign-aware in the accent
 * colour (`+ $123` for charges, `− $456` for refunds).
 *
 * Layout: side-by-side on `sm:` and up, stacked on mobile.
 */

import type { ReservationFlight } from '@/lib/sierra/types';

interface ItinerarySide {
  flights: ReservationFlight[];
  cabin: string;
  total: number;
}

interface DiffCardProps {
  before: ItinerarySide;
  after: ItinerarySide;
}

function formatMoney(amount: number): string {
  return `$${Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function FlightLine({ flight }: { flight: ReservationFlight }) {
  return (
    <div className="font-mono text-[11px] leading-relaxed text-secondary">
      <span className="text-foreground">[{flight.flight_number}]</span>{' '}
      {flight.origin} → {flight.destination}{' '}
      <span className="text-tertiary">{flight.date}</span>{' '}
      <span className="text-foreground">{formatMoney(flight.price)}</span>
    </div>
  );
}

function Side({ label, side }: { label: string; side: ItinerarySide }) {
  return (
    <div className="rounded-md border border-border bg-code-bg p-3">
      <p className="text-[10px] uppercase tracking-widest text-tertiary">
        {label}
      </p>
      <div className="mt-2 space-y-1">
        {side.flights.map((f) => (
          <FlightLine key={`${f.flight_number}-${f.date}`} flight={f} />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs">
        <span className="text-secondary capitalize">
          {side.cabin.replace(/_/g, ' ')}
        </span>
        <span className="font-mono text-foreground">
          {formatMoney(side.total)}
        </span>
      </div>
    </div>
  );
}

export function DiffCard({ before, after }: DiffCardProps) {
  const delta = after.total - before.total;
  const sign = delta > 0 ? '+ ' : delta < 0 ? '− ' : '';

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-4">
        <Side label="Before" side={before} />
        <Side label="After" side={after} />
      </div>
      <div className="text-right font-mono text-xs">
        <span className="text-secondary">Fare delta:&nbsp;</span>
        <span className="text-accent">
          {sign}
          {formatMoney(delta)}
        </span>
      </div>
    </div>
  );
}

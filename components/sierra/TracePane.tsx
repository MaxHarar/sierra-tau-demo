'use client';

/**
 * Sierra trace pane (TDD § 2 right pane).
 *
 * Vertical timeline of every tool call across the message history. Used
 * primarily so a viewer can audit *what the agent did* — independent of
 * the conversational summary that lands in `<ChatPane />`.
 *
 * v1 keeps it simple: tool name + state dot + order index. Per-part
 * timestamps don't ship in the v6 part shape, so we render "step N"
 * positional ordering.
 */

import { useEffect, useRef } from 'react';
import type { UIMessage } from 'ai';

interface TracePaneProps {
  messages: UIMessage[];
}

interface PartLike {
  type?: string;
  state?: string;
  text?: string;
  toolCallId?: string;
}

type Dot = 'pending' | 'executing' | 'complete' | 'error' | 'reasoning';

const DOT_COLOR: Record<Dot, string> = {
  pending: 'bg-accent animate-pulse',
  executing: 'bg-accent',
  complete: 'bg-foreground',
  error: 'bg-red-500',
  reasoning: 'bg-tertiary',
};

interface TraceEntry {
  key: string;
  label: string;
  kind: Dot;
}

function buildEntries(messages: UIMessage[]): TraceEntry[] {
  const entries: TraceEntry[] = [];
  let stepIdx = 0;

  for (const m of messages) {
    for (const rawPart of m.parts ?? []) {
      const part = rawPart as PartLike;
      const type = part.type;
      if (typeof type !== 'string') continue;

      if (type.startsWith('tool-')) {
        const name = type.slice('tool-'.length);
        let kind: Dot = 'pending';
        switch (part.state) {
          case 'input-streaming':
            kind = 'pending';
            break;
          case 'input-available':
          case 'approval-requested':
          case 'approval-responded':
            kind = 'executing';
            break;
          case 'output-available':
            kind = 'complete';
            break;
          case 'output-error':
            kind = 'error';
            break;
          default:
            kind = 'pending';
        }
        stepIdx += 1;
        entries.push({
          key: part.toolCallId ?? `${m.id}-${stepIdx}`,
          label: name,
          kind,
        });
      } else if (type === 'reasoning' && (part.text ?? '').length > 0) {
        stepIdx += 1;
        entries.push({
          key: `${m.id}-reasoning-${stepIdx}`,
          label: 'reasoning',
          kind: 'reasoning',
        });
      }
    }
  }

  return entries;
}

export function TracePane({ messages }: TracePaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const entries = buildEntries(messages);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div
      ref={scrollRef}
      className="max-h-[60vh] overflow-y-auto border-l border-border pl-3"
    >
      <p className="mb-2 text-[10px] uppercase tracking-widest text-tertiary">
        Trace
      </p>
      {entries.length === 0 ? (
        <p className="text-xs italic text-tertiary">No tool calls yet.</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((e, i) => (
            <li key={e.key} className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[e.kind]}`}
                aria-hidden="true"
              />
              <span className="font-mono text-[11px] text-secondary">
                <span className="text-tertiary">{i + 1}.</span> {e.label}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

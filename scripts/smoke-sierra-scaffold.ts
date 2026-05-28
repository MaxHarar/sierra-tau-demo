import { buildWorld } from '../lib/sierra/world';
import { CONFIG } from '../lib/sierra/config';
import { getAirlineWiki } from '../lib/sierra/wiki';
import { airlineTools } from '../lib/sierra/tools';

const world = buildWorld([]);
const wiki = getAirlineWiki();

console.log('users:        ', Object.keys(world.users).length);
console.log('flights:      ', Object.keys(world.flights).length);
console.log('reservations: ', Object.keys(world.reservations).length);
console.log('wiki chars:   ', wiki.length);
console.log('config:       ', CONFIG);

const uCount = Object.keys(world.users).length;
const rCount = Object.keys(world.reservations).length;
if (uCount === 0 || rCount === 0 || wiki.length === 0) {
  console.error('FAIL: empty corpus');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Chunk 2 — verify the tool catalog wires up and a read tool returns data.
// ---------------------------------------------------------------------------

const tools = airlineTools(world);
const toolCount = Object.keys(tools).length;
console.log('tool count:   ', toolCount);

// Wrapped in IIFE because tsx defaults to CJS output, which doesn't allow
// top-level await. The smoke is otherwise straight-line.
void (async () => {
  const userOut = await (tools.get_user_details as unknown as {
    execute: (
      input: { user_id: string },
      options: { toolCallId: string; messages: unknown[] },
    ) => Promise<unknown>;
  }).execute({ user_id: 'mia_li_3668' }, { toolCallId: 't1', messages: [] });

  const membership =
    userOut && typeof userOut === 'object' && 'membership' in userOut
      ? (userOut as { membership: string }).membership
      : 'NOT FOUND';
  console.log('mia_li_3668 membership:', membership);

  if (toolCount !== 8 || membership !== 'gold') {
    console.error('FAIL: tool wiring smoke');
    process.exit(1);
  }

  console.log('OK');
})();

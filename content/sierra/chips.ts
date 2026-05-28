/**
 * Sierra demo example chips (TDD § 11.6, PRD § 7).
 *
 * Each chip's `prompt` is sent verbatim to `/api/sierra/chat` when the user
 * picks the chip. The user IDs and reservation IDs reference the τ-bench
 * airline corpus that ships under `app/sierra/data/`. The chips are picked
 * to exercise the three behaviours the demo must demonstrate:
 *
 *  - happy-path flight change (chip 1)
 *  - happy-path cancellation (chip 2)
 *  - calibrated refusal with policy citation (chip 3)
 *  - simple lookup (chip 4)
 *  - clarifying-question request (chip 5)
 */
export interface Chip {
  label: string;
  prompt: string;
}

export const CHIPS: Chip[] = [
  {
    label: 'Change my flight to LAX',
    prompt:
      "I'm Mia Li (user_id mia_li_3668). I want to change my upcoming reservation to fly into LAX on May 22 instead.",
  },
  {
    label: 'Cancel my reservation',
    prompt:
      "I'm Chen Jackson (user_id chen_jackson_3290). I need to cancel reservation 4WQ150 and get a refund.",
  },
  {
    label: 'Bump me to first class, free',
    prompt:
      "I'm a gold member with reservation 4WQ150. Can you upgrade me to first class for free as a courtesy?",
  },
  {
    label: "What's my flight status?",
    prompt:
      "I'm Mia Li (user_id mia_li_3668). Can you tell me when my next flight departs?",
  },
  {
    label: 'Refund me but keep the seat',
    prompt: 'Can you refund reservation 4WQ150 but keep me on the flights?',
  },
];

// Shared by the Mandalart screens (view #346, editor #347).
import { apiKey } from './lib/query';

export type MandalartSummary = {
  id: number;
  title: string;
  filledCount: number;
  updatedAt: string;
};
export type Mandalart = {
  id: number;
  title: string;
  /** cells[block][position]: block 4 position 4 is the main goal, block 4 holds the 8 sub-goals. */
  cells: string[][];
};

// The list key also covers each Mandalart under it (apiKey docs in lib/query.ts), so a change refreshes both.
export const mandalartsKey = apiKey('/api/mandalarts');
export const mandalartPath = (id: number | string) => `/mandalarts/${id}`;

export const centre = 4;
export const cellCount = 81;
// Sub-goals are numbered 1-8 around the main goal: position 0-3 are 1-4 and position 5-8 are 5-8.
const subGoalNumber = (position: number) => (position < centre ? position + 1 : position);

/** The name a screen reader hears for one cell: what it is, and its text or "empty". */
export function cellLabel(cells: string[][], block: number, position: number) {
  const text = cells[block][position] || 'empty';
  if (block === centre && position === centre) return `Main goal: ${text}`;
  if (block === centre) return `Sub-goal ${subGoalNumber(position)}: ${text}`;
  if (position === centre) return `Sub-goal ${subGoalNumber(block)} (centre of its block): ${text}`;
  return `Action ${subGoalNumber(position)} of sub-goal ${subGoalNumber(block)}: ${text}`;
}

export const blockName = (cells: string[][], block: number) =>
  block === centre
    ? 'Main goal and sub-goals'
    : `Sub-goal ${subGoalNumber(block)}${cells[centre][block] ? `: ${cells[centre][block]}` : ''}`;

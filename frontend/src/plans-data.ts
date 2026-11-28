import { formatDate } from './format-date';

// What the Plans page and its forms share: the types, the horizons and the labels.
export type PlanHorizon = 'week' | 'twelve_week' | 'year' | 'decade';
export type PlanStatus = 'planned' | 'in_progress' | 'done' | 'dropped';
export type Plan = {
  id: number;
  horizon: PlanHorizon;
  periodStart: string;
  periodEnd: string;
  title: string;
  description: string | null;
  status: PlanStatus;
};
export type PlansData = {
  horizon: PlanHorizon;
  period: { start: string; end: string };
  plans: Plan[];
};

export const plansPath = '/api/plans';

export const horizons: { value: PlanHorizon; label: string; title: string; empty: string }[] = [
  { value: 'week', label: 'This week', title: 'This week', empty: 'No plans for this week yet' },
  {
    value: 'twelve_week',
    label: 'This 12 weeks',
    title: 'These 12 weeks',
    empty: 'No plans for these 12 weeks yet',
  },
  {
    value: 'year',
    label: 'This year',
    title: 'This year (52 weeks)',
    empty: 'No plans for this year yet',
  },
  {
    value: 'decade',
    label: 'Next 10 years',
    title: 'The next 10 years',
    empty: 'No plans for the next 10 years yet',
  },
];

export const statusLabels: Record<PlanStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Done',
  dropped: 'Dropped',
};
export const statusVariants = {
  planned: 'secondary',
  in_progress: 'default',
  done: 'success',
  dropped: 'outline',
} as const;

export const formatRange = (start: string, end: string) =>
  `${formatDate(start)} to ${formatDate(end)}`;

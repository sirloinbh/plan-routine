import {
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChartNoAxesColumn,
  History,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  Settings2,
  Target,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router';

import { AppShell, type NavItem } from './components/layout/app-shell';
import { Button } from './components/ui/button';
import { EmptyState } from './components/ui/empty-state';
import { Toaster } from './components/ui/sonner';
import { DailyChecklist } from './daily-checklist';
import { Diary } from './diary';
import { FourWeekDue } from './four-week-due';
import { type Health, healthText } from './health';
import { FourWeekRoutines, WeeklyRoutines } from './period-routines';
import { ProjectLinks } from './project-links';
import { Records } from './records';
import { DailyRoutines } from './routines';
import { Stats } from './stats';
import { TwelveWeek } from './twelve-week';

// Every page URL lives here (central docs/directory-rules.md).
const pages = {
  overview: '/',
  today: '/today',
  diary: '/diary',
  routines: '/routines',
  weekly: '/weekly',
  fourWeek: '/four-week',
  twelveWeek: '/twelve-week',
  records: '/records',
  stats: '/stats',
  settings: '/settings',
} as const;

// Main menu (LNB) items, in display order.
const nav: NavItem[] = [
  { to: pages.overview, label: 'Dashboard', icon: LayoutDashboard },
  { to: pages.today, label: 'Today', icon: CalendarCheck },
  { to: pages.diary, label: 'Diary', icon: NotebookPen },
  { to: pages.routines, label: 'Daily routines', icon: ListChecks },
  { to: pages.weekly, label: 'Weekly routines', icon: CalendarRange },
  { to: pages.fourWeek, label: '4-week routines', icon: CalendarDays },
  { to: pages.twelveWeek, label: '12-week routines', icon: Target },
  { to: pages.records, label: 'Records', icon: History },
  { to: pages.stats, label: 'Completion rates', icon: ChartNoAxesColumn },
  { to: pages.settings, label: 'Settings', icon: Settings2 },
];

function useHealth() {
  const [health, setHealth] = useState<Health>({ state: 'loading' });
  useEffect(() => {
    fetch('/api/health')
      .then(async (response) => {
        const data = (await response.json()) as { today?: string; error?: string };
        setHealth(
          response.ok && data.today
            ? { state: 'ok', today: data.today }
            : { state: 'error', message: data.error ?? 'Cannot check the server status' },
        );
      })
      .catch(() => setHealth({ state: 'error', message: 'Cannot reach the server' }));
  }, []);
  return health;
}

function Page({
  title,
  description,
  health,
  children,
}: {
  title: string;
  description: string;
  health: Health;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id="page-title">{title}</h1>
        <p className="text-body text-muted-foreground">{description}</p>
        {health.state === 'error' ? (
          <p role="alert" className="text-body-sm text-destructive">
            {healthText(health)}
          </p>
        ) : (
          <p role="status" className="text-caption text-muted-foreground">
            {healthText(health)}
          </p>
        )}
      </header>
      {children ?? (
        <EmptyState
          title="No features yet"
          description="Features are registered as GitHub issue cards, then added one at a time."
        />
      )}
    </section>
  );
}

export function App() {
  const health = useHealth();
  return (
    <BrowserRouter>
      <AppShell appName="Plan · Practice · Routine · Feedback" nav={nav}>
        <Routes>
          <Route
            path={pages.overview}
            element={
              <Page
                title="Dashboard"
                description="A personal service to make plans, record practice and routines, and improve with feedback"
                health={health}
              />
            }
          />
          <Route
            path={pages.today}
            element={
              <Page
                title="Today"
                description="Check off today's daily routines. You can edit up to the last 7 days"
                health={health}
              >
                <DailyChecklist />
                <FourWeekDue />
                <Button asChild variant="outline" className="self-start">
                  <Link to={pages.diary}>Write today's diary</Link>
                </Button>
              </Page>
            }
          />
          <Route
            path={pages.diary}
            element={
              <Page
                title="Diary"
                description="Look back on your day and leave feedback"
                health={health}
              >
                <Diary />
              </Page>
            }
          />
          <Route
            path={pages.routines}
            element={
              <Page
                title="Daily routines"
                description="Set what to do every day: wake-up, exercise, diet, housework, self-care, study, and reading"
                health={health}
              >
                <DailyRoutines />
              </Page>
            }
          />
          <Route
            path={pages.weekly}
            element={
              <Page
                title="Weekly routines"
                description="Set what to do once a week and check whether you finished it this week"
                health={health}
              >
                <WeeklyRoutines />
              </Page>
            }
          />
          <Route
            path={pages.fourWeek}
            element={
              <Page
                title="4-week routines"
                description="Set what to do once every 4 weeks and check whether you finished it this period"
                health={health}
              >
                <FourWeekRoutines />
              </Page>
            }
          />
          <Route
            path={pages.twelveWeek}
            element={
              <Page
                title="12-week routines"
                description="Set your goals again every 12 weeks and look back on the last 12 weeks"
                health={health}
              >
                <TwelveWeek />
              </Page>
            }
          />
          <Route
            path={pages.records}
            element={
              <Page
                title="Records"
                description="Review past daily routine checks and diary entries"
                health={health}
              >
                <Records />
              </Page>
            }
          />
          <Route
            path={pages.stats}
            element={
              <Page
                title="Completion rates"
                description="See how consistently you kept your routines, by period"
                health={health}
              >
                <Stats />
              </Page>
            }
          />
          <Route
            path={pages.settings}
            element={
              <Page
                title="Settings"
                description="App environment and data management"
                health={health}
              >
                <ProjectLinks />
              </Page>
            }
          />
          <Route path="*" element={<Navigate to={pages.overview} replace />} />
        </Routes>
      </AppShell>
      <Toaster />
    </BrowserRouter>
  );
}

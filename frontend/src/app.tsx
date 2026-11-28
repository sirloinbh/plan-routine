import { QueryClientProvider } from '@tanstack/react-query';
import {
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChartNoAxesColumn,
  ClipboardCheck,
  Flag,
  History,
  ListChecks,
  NotebookPen,
  Settings2,
  Target,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router';

import { AppShell, type NavItem } from './components/layout/app-shell';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
import { DailyChecklist } from './daily-checklist';
import { Diary } from './diary';
import { ExportSection } from './export-section';
import { FourWeekDue } from './four-week-due';
import { type Health, healthText } from './health';
import { createQueryClient } from './lib/query';
import { MoodStats } from './mood-stats';
import { FourWeekRoutines, WeeklyRoutines } from './period-routines';
import { Plans } from './plans';
import { ProjectLinks } from './project-links';
import { Records } from './records';
import { ReminderSection } from './reminder-section';
import { DailyRoutines } from './routines';
import { AccountActions, SignInGate } from './sign-in';
import { Stats } from './stats';
import { TwelveWeek } from './twelve-week';
import { WeeklyReview } from './weekly-review';

// Every page URL lives here (central docs/directory-rules.md).
const pages = {
  home: '/',
  today: '/today',
  diary: '/diary',
  routines: '/routines',
  weekly: '/weekly',
  fourWeek: '/four-week',
  twelveWeek: '/twelve-week',
  plans: '/plans',
  records: '/records',
  stats: '/stats',
  review: '/review',
  settings: '/settings',
} as const;

// Main menu (LNB) items, in display order (project-standards#1128, plan-routine#328): the day log,
// the Week and 12-week views, the other pages, the dashboard (completion rates), Settings.
const nav: NavItem[] = [
  { to: pages.today, label: 'Today', icon: CalendarCheck },
  { to: pages.weekly, label: 'Weekly routines', icon: CalendarRange },
  { to: pages.twelveWeek, label: '12-week routines', icon: Target },
  { to: pages.plans, label: 'Plans', icon: Flag },
  { to: pages.diary, label: 'Diary', icon: NotebookPen },
  { to: pages.routines, label: 'Daily routines', icon: ListChecks },
  { to: pages.fourWeek, label: '4-week routines', icon: CalendarDays },
  { to: pages.records, label: 'Records', icon: History },
  { to: pages.review, label: 'Weekly review', icon: ClipboardCheck },
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
  children: ReactNode;
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
      {children}
    </section>
  );
}

export function App() {
  const health = useHealth();
  // One client for the life of the app, so screens share loads and cached answers.
  const [queryClient] = useState(() => createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SignInGate>
          <AppShell
            appName="Plan · Practice · Routine · Feedback"
            nav={nav}
            actions={<AccountActions />}
          >
            <Routes>
              {/* Today is the first screen: opening the app lands on the checklist. */}
              <Route path={pages.home} element={<Navigate to={pages.today} replace />} />
              <Route
                path={pages.today}
                element={
                  <Page
                    title="Today"
                    description="Check off today's daily routines. You can edit today and the 7 days before it"
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
                path={pages.plans}
                element={
                  <Page
                    title="Plans"
                    description="See your plans for this week, these 12 weeks, this year and the next 10 years"
                    health={health}
                  >
                    <Plans />
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
                    <div className="flex flex-col gap-6">
                      <Stats />
                      <MoodStats />
                    </div>
                  </Page>
                }
              />
              <Route
                path={pages.review}
                element={
                  <Page
                    title="Weekly review"
                    description="Look back on a week: how much you did, what you missed, and what to change"
                    health={health}
                  >
                    <WeeklyReview />
                  </Page>
                }
              />
              <Route
                path={pages.settings}
                element={
                  <Page
                    title="Settings"
                    description="Manage the other apps your routines can open, the evening reminder, and your data"
                    health={health}
                  >
                    <div className="flex flex-col gap-6">
                      <ProjectLinks />
                      <ReminderSection />
                      <ExportSection />
                    </div>
                  </Page>
                }
              />
              <Route path="*" element={<Navigate to={pages.today} replace />} />
            </Routes>
          </AppShell>
          <Toaster />
        </SignInGate>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

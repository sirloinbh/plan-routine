import {
  CalendarCheck,
  CalendarRange,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  Settings2,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router';

import { AppShell, type NavItem } from './components/layout/app-shell';
import { Button } from './components/ui/button';
import { EmptyState } from './components/ui/empty-state';
import { Toaster } from './components/ui/sonner';
import { DailyChecklist } from './daily-checklist';
import { Diary } from './diary';
import { type Health, healthText } from './health';
import { DailyRoutines } from './routines';
import { WeeklyRoutines } from './weekly-routines';

// Every page URL lives here (central docs/directory-rules.md).
const pages = {
  overview: '/',
  today: '/today',
  diary: '/diary',
  routines: '/routines',
  weekly: '/weekly',
  settings: '/settings',
} as const;

// Main menu (LNB) items, in display order.
const nav: NavItem[] = [
  { to: pages.overview, label: '대시보드', icon: LayoutDashboard },
  { to: pages.today, label: '오늘 체크', icon: CalendarCheck },
  { to: pages.diary, label: '일기', icon: NotebookPen },
  { to: pages.routines, label: '하루 루틴', icon: ListChecks },
  { to: pages.weekly, label: '주간 루틴', icon: CalendarRange },
  { to: pages.settings, label: '설정', icon: Settings2 },
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
            : { state: 'error', message: data.error ?? '서버 상태를 확인할 수 없습니다' },
        );
      })
      .catch(() => setHealth({ state: 'error', message: '서버에 연결할 수 없습니다' }));
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
          title="아직 기능이 없습니다"
          description="기능은 GitHub 이슈 카드로 등록한 뒤 하나씩 추가합니다."
        />
      )}
    </section>
  );
}

export function App() {
  const health = useHealth();
  return (
    <BrowserRouter>
      <AppShell appName="계획·실천·루틴·피드백" nav={nav}>
        <Routes>
          <Route
            path={pages.overview}
            element={
              <Page
                title="대시보드"
                description="계획을 세우고 실천과 루틴을 기록하며 피드백으로 개선하는 개인 서비스"
                health={health}
              />
            }
          />
          <Route
            path={pages.today}
            element={
              <Page
                title="오늘 체크"
                description="오늘의 하루 루틴을 체크합니다. 지난 7일까지는 고칠 수 있습니다"
                health={health}
              >
                <DailyChecklist />
                <Button asChild variant="outline" className="self-start">
                  <Link to={pages.diary}>오늘 일기 쓰기</Link>
                </Button>
              </Page>
            }
          />
          <Route
            path={pages.diary}
            element={
              <Page
                title="일기"
                description="오늘 하루를 돌아보고 피드백을 남깁니다"
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
                title="하루 루틴"
                description="기상·운동·식단·가사·관리·공부·독서별로 매일 할 일을 정합니다"
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
                title="주간 루틴"
                description="매주 한 번 할 일을 정하고 이번 주 완료 여부를 체크합니다"
                health={health}
              >
                <WeeklyRoutines />
              </Page>
            }
          />
          <Route
            path={pages.settings}
            element={<Page title="설정" description="앱 환경과 데이터 관리" health={health} />}
          />
          <Route path="*" element={<Navigate to={pages.overview} replace />} />
        </Routes>
      </AppShell>
      <Toaster />
    </BrowserRouter>
  );
}

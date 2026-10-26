import { LayoutDashboard, ListChecks, Settings2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell, type NavItem } from './components/layout/app-shell';
import { EmptyState } from './components/ui/empty-state';
import { Toaster } from './components/ui/sonner';
import { healthText, type Health } from './health';
import { DailyRoutines } from './routines';

// Every page URL lives here (central docs/directory-rules.md).
export const pages = { overview: '/', routines: '/routines', settings: '/settings' } as const;

// Main menu (LNB) items, in display order.
const nav: NavItem[] = [
  { to: pages.overview, label: '대시보드', icon: LayoutDashboard },
  { to: pages.routines, label: '하루 루틴', icon: ListChecks },
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

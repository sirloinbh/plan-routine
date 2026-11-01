import { useEffect, useState } from 'react';

import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { LabeledTextarea } from './labeled-textarea';
import { requestJson } from './lib/api';
import { useNotice } from './lib/use-notice';

type DiaryEntry = {
  date: string;
  body: string;
  goodNote: string | null;
  regretNote: string | null;
  tomorrowNote: string | null;
};

type DiaryData = {
  date: string;
  today: string;
  previousDate: string | null;
  nextDate: string | null;
  progress: { checked: number; total: number };
  entry: DiaryEntry | null;
};

type DiaryForm = { body: string; goodNote: string; regretNote: string; tomorrowNote: string };

const formFrom = (entry: DiaryEntry | null): DiaryForm => ({
  body: entry?.body ?? '',
  goodNote: entry?.goodNote ?? '',
  regretNote: entry?.regretNote ?? '',
  tomorrowNote: entry?.tomorrowNote ?? '',
});

const sameForm = (a: DiaryForm, b: DiaryForm) =>
  a.body === b.body &&
  a.goodNote === b.goodNote &&
  a.regretNote === b.regretNote &&
  a.tomorrowNote === b.tomorrowNote;

export function Diary() {
  // null follows the server's today.
  const [date, setDate] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<DiaryData | null>(null);
  const [form, setForm] = useState<DiaryForm>(formFrom(null));
  const [savedForm, setSavedForm] = useState<DiaryForm>(formFrom(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // A notice appears beside what it is about: the save button or the date buttons.
  const [noticeAtSave, setNoticeAtSave] = useState(false);
  const { notice, status, error, clear } = useNotice();

  useEffect(() => {
    // A newer load supersedes this one, so a slow older response cannot overwrite it.
    let ignore = false;
    requestJson<DiaryData>(`/api/diary${date ? `?date=${date}` : ''}`)
      .then((loaded) => {
        if (ignore) return;
        setData(loaded);
        setForm(formFrom(loaded.entry));
        setSavedForm(formFrom(loaded.entry));
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (ignore) return;
        setLoading(false);
        error(cause);
      });
    return () => {
      ignore = true;
    };
  }, [date, version, error]);

  const dirty = !sameForm(form, savedForm);

  const setField = (field: keyof DiaryForm) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  // Also bumps the version so pressing the same button again retries a failed load.
  const moveTo = (target: string | null) => {
    if (saving) return;
    setNoticeAtSave(false);
    if (dirty) {
      error('저장하지 않은 내용이 있습니다. 저장한 뒤 날짜를 옮겨 주세요');
      return;
    }
    clear();
    setLoading(true);
    setDate(target);
    setVersion((value) => value + 1);
  };

  const save = async (target: string) => {
    if (saving || loading) return;
    setSaving(true);
    setNoticeAtSave(true);
    clear();
    try {
      const { entry } = await requestJson<{ entry: DiaryEntry }>(`/api/diary/${target}`, {
        method: 'PUT',
        body: form,
      });
      setForm(formFrom(entry));
      setSavedForm(formFrom(entry));
      status(`${target} 일기를 저장했습니다`);
    } catch (cause) {
      error(cause);
    } finally {
      setSaving(false);
    }
  };

  if (!data)
    return loading ? (
      <p role="status" className="text-body-sm text-muted-foreground">
        일기를 불러오는 중…
      </p>
    ) : (
      <div className="flex flex-col items-start gap-3">
        <Notice notice={notice} />
        <Button type="button" variant="outline" size="sm" onClick={() => moveTo(date)}>
          다시 시도
        </Button>
      </div>
    );

  const isToday = data.date === data.today;
  const readOnly = loading || saving;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-body font-semibold">{isToday ? `오늘 (${data.date})` : data.date}</h2>
          {data.progress.total > 0 && (
            <p className="text-body-sm text-muted-foreground">
              하루 루틴 {data.progress.checked}/{data.progress.total} 완료
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!data.previousDate}
            onClick={() => data.previousDate && moveTo(data.previousDate)}
          >
            이전 날
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!data.nextDate}
            onClick={() =>
              data.nextDate && moveTo(data.nextDate === data.today ? null : data.nextDate)
            }
          >
            다음 날
          </Button>
          {!isToday && (
            <Button type="button" variant="ghost" size="sm" onClick={() => moveTo(null)}>
              오늘로
            </Button>
          )}
        </div>
      </div>
      {!noticeAtSave && <Notice notice={notice} />}
      <Card>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            aria-label={`${data.date} 일기`}
            onSubmit={(event) => {
              event.preventDefault();
              void save(data.date);
            }}
          >
            <LabeledTextarea
              id="diary-body"
              label="하루 돌아보기"
              value={form.body}
              rows={8}
              limit={5000}
              readOnly={readOnly}
              onChange={setField('body')}
            />
            <LabeledTextarea
              id="diary-good"
              label="잘한 점 (선택)"
              value={form.goodNote}
              rows={2}
              limit={1000}
              readOnly={readOnly}
              onChange={setField('goodNote')}
            />
            <LabeledTextarea
              id="diary-regret"
              label="아쉬운 점 (선택)"
              value={form.regretNote}
              rows={2}
              limit={1000}
              readOnly={readOnly}
              onChange={setField('regretNote')}
            />
            <LabeledTextarea
              id="diary-tomorrow"
              label="내일 할 일 (선택)"
              value={form.tomorrowNote}
              rows={2}
              limit={1000}
              readOnly={readOnly}
              onChange={setField('tomorrowNote')}
            />
            {noticeAtSave && <Notice notice={notice} />}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">저장</Button>
              {dirty && (
                <span className="text-body-sm text-muted-foreground">
                  저장하지 않은 내용이 있습니다
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

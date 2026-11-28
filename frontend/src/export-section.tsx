import { useState } from 'react';

import { downloadBlob } from './components/file-field/download-blob';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { Spinner } from './components/ui/spinner';
import { useNotice } from './lib/use-notice';

const files = [
  {
    key: 'json',
    label: 'All data (JSON)',
    path: '/api/export',
    fallback: 'plan-routine-export.json',
  },
  {
    key: 'checks',
    label: 'Checks (CSV)',
    path: '/api/export/checks.csv',
    fallback: 'plan-routine-checks.csv',
  },
  {
    key: 'diary',
    label: 'Diary (CSV)',
    path: '/api/export/diary.csv',
    fallback: 'plan-routine-diary.csv',
  },
] as const;

const fileName = (response: Response, fallback: string) =>
  /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? fallback;

async function failure(response: Response) {
  if (response.status === 401) return 'Your sign-in has ended. Reload the page and sign in again';
  try {
    const { error } = (await response.json()) as { error?: unknown };
    if (typeof error === 'string' && error) return error;
  } catch {
    // An answer that is not JSON has no message to show.
  }
  return 'Could not download the file';
}

// Downloads of the user's own data. A plain link would save an error page as the file when the request
// fails, so the file is fetched first and saved only when the server answered it.
export function ExportSection() {
  const [busy, setBusy] = useState<string | null>(null);
  const { notice, status, error, clear } = useNotice();

  const download = async (file: (typeof files)[number]) => {
    if (busy) return;
    setBusy(file.key);
    clear();
    try {
      const response = await fetch(file.path);
      if (!response.ok) {
        error(await failure(response));
        return;
      }
      const blob = await response.blob();
      const name = fileName(response, file.fallback);
      downloadBlob(name, blob.type, blob);
      status(`Downloaded ${name}`);
    } catch {
      error('Cannot reach the server');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card role="region" aria-label="Download your data">
      <CardHeader>
        <CardTitle>Download your data</CardTitle>
        <CardDescription>
          Your data lives only in the database volume, and <code>docker compose down -v</code>{' '}
          deletes it. Keep a copy somewhere safe. The files hold your real diary and checks, so do
          not share them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {files.map((file) => (
            <Button
              key={file.key}
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void download(file)}
            >
              {busy === file.key && <Spinner size="sm" label="Downloading" />}
              {file.label}
            </Button>
          ))}
        </div>
        <Notice notice={notice} />
      </CardContent>
    </Card>
  );
}

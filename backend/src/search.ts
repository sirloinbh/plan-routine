export const diaryFields = ['body', 'goodNote', 'regretNote', 'tomorrowNote'] as const;
export type DiaryField = (typeof diaryFields)[number];
export type DiaryTexts = Record<DiaryField, string | null>;

const context = 40;
const noQueryLength = 120;

/** `%`, `_` and `\` mean something to LIKE; escape them so the typed text is matched as typed. */
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

const squash = (text: string) => text.replace(/\s+/g, ' ');

/**
 * A short piece of the entry for the result list: around the first match, in the first field that holds it (the
 * body first). Without a query (a routine filter alone), the start of the body.
 */
export function buildSnippet(texts: DiaryTexts, query: string | null) {
  const needle = query?.toLocaleLowerCase();
  if (needle) {
    for (const field of diaryFields) {
      const text = texts[field];
      // ILIKE and toLocaleLowerCase differ for a few letters; falling through is safe, the row still shows.
      const at = text?.toLocaleLowerCase().indexOf(needle) ?? -1;
      if (text && at >= 0) {
        const start = Math.max(0, at - context);
        const end = Math.min(text.length, at + needle.length + context);
        return {
          field,
          snippet: `${start > 0 ? '…' : ''}${squash(text.slice(start, end)).trim()}${end < text.length ? '…' : ''}`,
        };
      }
    }
  }
  const body = texts.body ?? '';
  return {
    field: 'body' as const,
    snippet: `${squash(body.slice(0, noQueryLength)).trim()}${body.length > noQueryLength ? '…' : ''}`,
  };
}

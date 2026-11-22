import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { type DiaryDraft, type DiaryForm, draftKey, readDraft, useDiaryDraft } from './diary-draft';

const empty: DiaryForm = { body: '', goodNote: '', regretNote: '', tomorrowNote: '' };
const typed: DiaryForm = { ...empty, body: 'Unsaved text' };
const day = '2026-10-22';

type Props = { date: string | null; form: DiaryForm; savedForm: DiaryForm };
const setup = (props: Props) =>
  renderHook((current: Props) => useDiaryDraft(current), { initialProps: props });

afterEach(() => vi.restoreAllMocks());

test('stores unsaved text as a draft with the saved form as its base', () => {
  const { result } = setup({ date: day, form: typed, savedForm: empty });
  expect(readDraft()).toEqual({ date: day, form: typed, base: empty });
  expect(result.current.draftFailed).toBe(false);
});

test('stores nothing while no day is open', () => {
  setup({ date: null, form: typed, savedForm: empty });
  expect(readDraft()).toBeNull();
});

test('clears its own draft once the text matches what is saved', () => {
  const { rerender } = setup({ date: day, form: typed, savedForm: empty });
  expect(readDraft()).not.toBeNull();
  rerender({ date: day, form: typed, savedForm: typed });
  expect(readDraft()).toBeNull();
});

test('keeps the first base while the text keeps changing', () => {
  const { rerender } = setup({ date: day, form: typed, savedForm: empty });
  rerender({
    date: day,
    form: { ...typed, body: 'More text' },
    savedForm: { ...empty, body: 'Elsewhere' },
  });
  expect(readDraft()?.base).toEqual(empty);
});

test('an adopted draft keeps its own base', () => {
  const base = { ...empty, body: 'Earlier save' };
  const adopted: DiaryDraft = { date: day, form: typed, base };
  const { result, rerender } = setup({ date: null, form: empty, savedForm: empty });
  act(() => result.current.adopt(adopted));
  rerender({ date: day, form: typed, savedForm: { ...empty, body: 'Later save' } });
  expect(readDraft()?.base).toEqual(base);
});

test('reports a draft the browser refuses to keep', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('full');
  });
  const { result } = setup({ date: day, form: typed, savedForm: empty });
  expect(result.current.draftFailed).toBe(true);
});

test('another tab taking the draft is reported, and clearing it puts this tab back', () => {
  const { result } = setup({ date: day, form: typed, savedForm: empty });
  const theirs = JSON.stringify({ date: day, form: { ...empty, body: 'Other tab' }, base: empty });
  localStorage.setItem(draftKey, theirs);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: draftKey, newValue: theirs }));
  });
  expect(result.current.draftFailed).toBe(true);

  localStorage.removeItem(draftKey);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: draftKey, newValue: null }));
  });
  expect(readDraft()).toEqual({ date: day, form: typed, base: empty });
  expect(result.current.draftFailed).toBe(false);
});

test('leaving is warned about only when unsaved text could not be kept', () => {
  const unload = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  setup({ date: day, form: typed, savedForm: empty });
  expect(unload()).toBe(false);

  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('full');
  });
  setup({ date: day, form: { ...typed, body: 'Refused' }, savedForm: empty });
  expect(unload()).toBe(true);
});

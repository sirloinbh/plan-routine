# #85 일기 임시 글을 다시 보관한 뒤 버린 글이 되살아나는 회귀

- 이슈: [#85](https://github.com/sirloinbh/plan-routine/issues/85)
- 브랜치: `fix/85-diary-discard-regression`
- 일자: 2026-11-01 (Asia/Seoul)

## 경위

[#64](https://github.com/sirloinbh/plan-routine/issues/64)의 PR #84 2차 리뷰에서 찾은 회귀다. 수정 명령과 병합 명령을 동시에 실행했는데, 수정이 테스트 제목의 문법 오류로 멈춘 사이 병합이 먼저 진행되어 수정 없이 `main`에 들어갔다. 병합은 CI 통과와 커밋 일치만 확인하므로 막지 못했다. 앞으로 병합 명령은 앞선 작업의 결과를 본 뒤 단독으로 실행한다. 배포는 연결되어 있지 않아 실제 사용자 영향은 없다.

## 변경

`frontend/src/diary.tsx`.

- 다른 탭이 지운 임시 글을 다시 보관하는 데 성공하면 "빼앗긴" 상태를 푼다. 그러지 않으면 이 탭에서 버려도 임시 글이 지워지지 않아, 다음에 열 때 버린 글이 복원됐다.
- 빼앗겼다 되찾을 때 다른 탭의 기준이 아니라 이 글의 처음 기준을 쓴다. 그러지 않으면 "저장된 내용이 달라졌다"는 안내가 사라졌다.

`docs/changes/64-diary-two-tabs.md`의 검증 문장을 분명히 하고 2차 리뷰 결과를 적었다.

## 테스트

`frontend/src/diary.test.tsx`: 덮어쓰기, 지움, 버리기 순서 뒤 임시 글이 남지 않고 다시 열어도 복원되지 않음. 되찾을 때 처음 기준 유지.

## 검증

- 로컬: `env -u TEST_DATABASE_URL npm run check` 통과. 백엔드 161개 중 142 pass / 0 fail / 19 skip(DB 테스트), 프론트엔드 283개 중 281 pass / 0 fail / 2 skip(다크 모드 전용 공통 테스트), `test:skills` 4개 pass.
- 실제 탭 두 개의 브라우저 확인은 이 수정 뒤에 다시 하지 않았다. 화면 테스트로 확인했다.

## 한계·후속

없음.

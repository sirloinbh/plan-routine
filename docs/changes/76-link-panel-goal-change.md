# #76 루틴 연결 패널이 열린 채 목표가 바뀔 때 안내하기

- 이슈: [#76](https://github.com/sirloinbh/plan-routine/issues/76)
- 브랜치: `fix/76-link-panel-goal-change`
- 일자: 2026-11-01 (Asia/Seoul)

## 목적

패널이 열린 채 목표가 사라지면 체크가 안내 없이 버려지고 포커스가 `body`로 갔다. 같은 행의 "수정"을 눌러도 체크가 사라졌다.

## 결정

사용자가 선택지는 추천안으로 진행하라고 해 아래와 같이 정했다. 이슈는 열림 상태를 `CurrentGoals`로 올리자고 적었지만, 더 작게 고칠 수 있어 패널의 상태는 그대로 두었다. 이슈 코멘트에 기록했다.

- 패널을 수정 화면과 함께 유지한다. 이름을 고쳐도 체크가 남는다.
- 목표가 사라지면 안내하고 포커스를 "새 목표" 입력칸으로 옮긴다. 터치 화면에서는 입력칸으로 옮기지 않는다.

## 변경

`frontend/src/twelve-week.tsx`, `goal-routine-links.tsx`.

## 테스트

`frontend/src/twelve-week.test.tsx`: 목표가 사라질 때 안내와 포커스, 닫힌 패널은 안내 없음, 수정 중 패널과 체크 유지.

## 검증

- 로컬: `env -u TEST_DATABASE_URL npm run check` 통과. 백엔드 163개 중 144 pass / 0 fail / 19 skip(DB 테스트), 프론트엔드 301개 중 299 pass / 0 fail / 2 skip, `test:skills` 4개 pass.
- 브라우저: 임시 API와 헤드리스 Chrome으로 1440×900, 390×844에서 패널을 연 채 수정을 눌러, 입력칸으로 포커스가 가고 체크가 남는 것을 확인했다. 가로 스크롤과 콘솔 오류는 없었다. 목표가 사라지는 경우는 화면 테스트로만 확인했다.

## 한계·후속

없음.

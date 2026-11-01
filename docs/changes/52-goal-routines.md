# #52 12주 목표를 하루·주간 루틴과 연결하기

- 이슈: [#52](https://github.com/sirloinbh/plan-routine/issues/52)
- 브랜치: `feat/52-goal-routines`
- 일자: 2026-11-01 (Asia/Seoul)

## 목적

어떤 루틴이 어떤 목표를 위한 것인지 볼 수 있게 한다. #8에서 분리한 카드다.

## 결정

사용자가 선택지는 추천안으로 진행하라고 해 아래와 같이 정했다. 이슈 코멘트에 기록했다.

- 목표 하나에 하루·주간 루틴을 여러 개 연결한다. 한 루틴을 여러 목표에 연결할 수도 있다.
- 이번 기간 목표에서만 연결하고 해제한다. 지난 기간 카드에는 표시하지 않는다.
- 보관한 루틴은 목록에서 빠지고 새로 연결할 수 없다.
- 목표를 지우면 연결도 지워진다. 루틴과 체크 기록은 그대로다.
- 달성률이나 체크 화면에는 반영하지 않는다.

## 변경

- `database/migrations/005_goal_routines.sql`: `twelve_week_goal_routines` 표. **기존 DB에 이 마이그레이션을 적용해야 한다.**
- `backend/src/goal-routes.ts`: `GET /api/goals`의 이번 기간 목표에 `routines`를 더하고, `PUT /api/goals/:id/routines`를 추가했다. 한 트랜잭션에서 통째로 바꾼다. 연결할 수 없는 루틴이 하나라도 있으면 아무것도 바꾸지 않는다.
- `frontend/src/goal-routine-links.tsx`(새 파일), `twelve-week.tsx`: 목표마다 연결된 루틴을 보여 주고, "루틴 연결"에서 체크해 저장한다.

## 테스트

- `backend/test/goal-routes.test.ts`: 교체, 거부, 없는 목표와 지난 목표, 잘못된 입력.
- `backend/test/db.integration.test.ts`: 실제 DB로 마이그레이션 재실행, 교체, 거부 시 유지, 보관, 목표 삭제.
- `frontend/src/goal-routine-links.test.tsx`, `twelve-week.test.tsx`: 표시, 저장, 실패, 닫기, 포커스.

## 검증

- 로컬: `env -u TEST_DATABASE_URL npm run check` 통과. 백엔드 104개 중 88 pass / 0 fail / 16 skip(DB 테스트), 프론트엔드 246개 중 244 pass / 0 fail / 2 skip(다크 모드 전용 공통 테스트), `test:skills` 4개 pass.
- 브라우저: 임시 API와 헤드리스 Chrome으로 PC 1440×900, 모바일 390×844에서 실제 Enter·Space 키로 열기, 체크, 저장, 포커스 복귀를 확인했다. 긴 이름도 넘치지 않았고 콘솔 오류와 가로 스크롤은 없었다. 실제 DB, 실제 화면 낭독기, 실제 휴대폰으로는 확인하지 못했다.
- CI의 실제 DB: PR 코멘트에 적는다.

## 한계·후속

- 지난 기간 목표가 어떤 루틴과 연결됐는지는 볼 수 없다. 저장은 되어 있다.
- 루틴 쪽 화면에는 어느 목표에 연결됐는지 표시하지 않는다.

## 적용

이미 쓰는 로컬 DB에는 `database/README.md`의 절차로 `005_goal_routines.sql`을 적용해야 한다. 적용하지 않으면 `GET /api/goals`가 실패한다. 배포 스크립트는 자동으로 실행한다.

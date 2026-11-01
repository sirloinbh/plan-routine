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

- 로컬: `env -u TEST_DATABASE_URL npm run check` 통과. 백엔드 104개 중 88 pass / 0 fail / 16 skip(DB 테스트), 프론트엔드 252개 중 250 pass / 0 fail / 2 skip(다크 모드 전용 공통 테스트), `test:skills` 4개 pass.
- 브라우저: 임시 API와 헤드리스 Chrome으로 PC 1440×900, 모바일 390×844에서 실제 Enter·Space 키로 열기, 체크, 저장, 포커스 복귀를 확인했다. 긴 이름도 넘치지 않았고 콘솔 오류와 가로 스크롤은 없었다. 실제 DB, 실제 화면 낭독기, 실제 휴대폰으로는 확인하지 못했다.
- CI의 실제 DB: 1차 커밋에서 새 DB 테스트가 통과했고 skip 없이 104개 모두 pass였다.

## 한계·후속

- 지난 기간 목표가 어떤 루틴과 연결됐는지는 볼 수 없다. 저장은 되어 있다.
- 루틴 쪽 화면에는 어느 목표에 연결됐는지 표시하지 않는다.
- 패널이 열린 채 목표가 사라지거나 같은 행의 "수정"을 누르면 체크가 사라진다. [#76](https://github.com/sirloinbh/plan-routine/issues/76)으로 분리했다.

## 적용

이미 쓰는 DB에는 `database/README.md`의 절차로 `005_goal_routines.sql`을 직접 적용해야 한다. 적용하지 않으면 `GET /api/goals`가 실패한다. 새 Docker 볼륨은 처음 띄울 때 자동으로 적용된다. 배포 스크립트의 자동 적용은 실행기가 저장소에 없어 아직 동작하지 않는다([#75](https://github.com/sirloinbh/plan-routine/issues/75)).

## 자동 코드 리뷰

- 1차: 보완 8건과 기록 오류를 반영하고 2건을 분리했다. SQL은 리뷰에서 임시 PostgreSQL로 직접 실행해 문제가 없었다.
  - (보통) 다른 곳에서 보관된 루틴이 선택에 남아 저장이 계속 거부됐다. 목록을 받을 때와 저장 실패 때 정리한다. 테스트를 추가했다.
  - (보통) 저장 응답을 버려, 다시 불러오기가 실패하면 옛 연결이 보이고 되돌려 저장될 수 있었다. 응답을 바로 반영한다. 테스트를 추가했다.
  - (보통) 터치 화면에서 체크박스의 터치 영역이 겹쳤다. 행 높이를 늘렸다. 실제 기기로는 확인하지 못했다.
  - (낮음) 목록 로드 실패가 옮겨 간 사용자의 포커스를 빼앗았다. 고치고 테스트를 추가했다.
  - (낮음) 저장 중 닫기를 누른 뒤 실패하면 포커스가 사라졌다. 저장 중에는 닫기를 무시한다. 테스트를 추가했다.
  - (낮음) 패널 작업을 시작해도 이전 알림이 남았다. 지운다. 테스트를 추가했다.
  - (낮음) 거부 경로에서 연결을 쥔 채 다른 연결을 기다렸다. 같은 연결을 쓴다.
  - (낮음) 순서를 검사하지 않는 단언을 고쳤다.
  - (낮음) 배포 스크립트가 자동 적용한다는 기록이 틀렸다. 고쳤다.
  - 분리: 마이그레이션 실행기 없음은 [#75](https://github.com/sirloinbh/plan-routine/issues/75), 패널이 열린 채 목표가 바뀌는 경우는 [#76](https://github.com/sirloinbh/plan-routine/issues/76).

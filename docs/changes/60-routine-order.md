# #60 순서값이 같을 때 번호 순으로 정렬하기

- 이슈: [#60](https://github.com/sirloinbh/plan-routine/issues/60)
- 브랜치: `fix/60-routine-order`
- 일자: 2026-11-01 (Asia/Seoul)

## 목적

쿼리가 `id::text AS id`를 뽑은 뒤 `ORDER BY ..., id`로 정렬해, PostgreSQL이 번호를 글자로 비교했다. `10`이 `9`보다 앞에 왔다.

## 변경

표 이름을 붙여 실제 번호로 정렬한다. 이슈에 적힌 2곳 외에 같은 원인 4곳도 고쳤다.

| 위치                            | 쿼리                                             |
| ------------------------------- | ------------------------------------------------ |
| `backend/src/routine-routes.ts` | 루틴 목록, 이동할 때의 재정렬 기준, 이동 후 응답 |
| `backend/src/check-routes.ts`   | 체크리스트                                       |
| `backend/src/goal-routes.ts`    | 목표 목록, 회고 저장 응답                        |

`id::text`로 뽑지 않고 정렬하는 쿼리(`SELECT id ... ORDER BY id`)는 원래 번호로 정렬되므로 그대로 뒀다.

## 테스트

`backend/test/db.integration.test.ts`: 순서값이 같은 11개를 번호 999995~1000005로 넣고 루틴 목록, 체크리스트, 목표 목록의 순서와 이동 결과를 확인한다.

## 검증

- 로컬: `env -u TEST_DATABASE_URL npm run check` 통과. 백엔드 105개 중 88 pass / 0 fail / 17 skip(DB 테스트), 프론트엔드 252개 중 250 pass / 0 fail / 2 skip(다크 모드 전용 공통 테스트), `test:skills` 4개 pass.
- CI의 실제 DB, 수정 전 코드: 새 테스트만 실패했다(run 41301115200, 105개 중 104 pass, 1 fail). 임시 브랜치로 확인했고 원격에서 지웠다.
- CI의 실제 DB, 수정 후 코드: 105개 모두 pass, skip 0(run 41301171843).

## 한계·후속

없음.

## 자동 코드 리뷰

- 1차: 고칠 결함이 없었다. 실제 DB 결과와 정렬 위치 전체를 확인했다. 2차 리뷰는 절차에 따라 하지 않는다.
- 참고: 이동 후 응답과 회고 저장 응답의 정렬은 새 테스트로 직접 검증하지 않는다. 같은 패턴의 한 줄 수정이고, 이동 후 응답은 다시 매긴 뒤라 동점이 생기지 않는다.

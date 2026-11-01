# #42 보관과 체크의 동시 요청 DB 테스트

- 이슈: [#42](https://github.com/sirloinbh/plan-routine/issues/42)
- 브랜치: `test/42-archive-check-race`
- 일자: 2026-11-01 (Asia/Seoul)

## 목적

`backend/src/check-routes.ts`는 루틴 행을 `FOR SHARE`로 잠가, 보관 중인 루틴에 체크가 붙지 않게 한다. 지금까지는 코드 검토로만 확인했다. 실제 DB 테스트로 확인한다.

## 변경

`backend/test/db.integration.test.ts`에 테스트를 추가했다. 앱 코드는 바꾸지 않았다.

1. 트랜잭션에서 보관을 실행하고 커밋하지 않는다.
2. 체크 요청을 보낸다.
3. `pg_blocking_pids`로 요청이 그 잠금을 기다리는 것을 확인한다. 시간에 기대지 않기 위해서다.
4. 보관을 커밋한 뒤 체크 요청이 404이고 체크가 저장되지 않았음을 확인한다.

## 검증

- 로컬(`TEST_DATABASE_URL` 제거): `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build` 통과. `npm run test -w backend`는 85개 중 70 pass / 0 fail / 15 skip(DB 테스트, 새 테스트 포함). `npm run test:skills`는 4개 pass. 프론트엔드는 바뀌지 않아 돌리지 않았다. 이 PC는 Docker가 꺼져 있고, 셸의 `TEST_DATABASE_URL`은 다른 프로젝트의 DB를 가리켜 DB 테스트는 로컬에서 돌리지 않았다.
- CI: CI의 실제 DB에서 백엔드 85개 모두 pass, skip 0. 새 테스트는 약 0.12초에 끝났다(run 41273067041).
- 잠금을 뺀 코드로 실패 확인: 임시 브랜치에서 `FOR SHARE`를 빼자 새 테스트가 "The check request did not wait for the uncommitted archive"로 실패했다(run 41273074659). 같은 실행에서 SQL 문자열을 비교하는 다른 테스트 3개도 함께 실패했다. 이 브랜치는 병합하지 않았고 원격에서 지웠다.

## 한계·후속

없음.

## 자동 코드 리뷰

- 1차: 테스트 코드에는 고칠 결함이 없었다. 검증 기록에 실행한 명령과 개수가 빠졌다는 낮음 1건을 반영했다.
- 2차: 병합을 막는 결함은 없었다. 기록과 CI 결과가 일치함을 확인했다. 실제 명령을 적으라는 낮음 1건을 반영했다. 리뷰는 2회로 마친다.

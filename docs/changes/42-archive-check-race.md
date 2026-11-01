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

- 로컬(`TEST_DATABASE_URL` 제거): 포맷·lint·타입 검사 통과. 이 테스트는 건너뛴다. 이 PC는 Docker가 꺼져 있고, 셸의 `TEST_DATABASE_URL`은 다른 프로젝트의 DB를 가리켜 쓰지 않았다.
- CI: MAINRESULT
- 잠금을 뺀 코드로 실패 확인: MUTATIONRESULT

## 한계·후속

없음.

# #75 배포 스크립트의 마이그레이션 실행기 갖추기

- 이슈: [#75](https://github.com/sirloinbh/plan-routine/issues/75)
- 브랜치: `feat/75-migration-runner`
- 일자: 2026-11-01 (Asia/Seoul)

## 목적

`deploy/remote-deploy.sh`는 `node dist/migrate.js`를 실행하지만 소스가 저장소에 없었다. 배포를 연결하면 이 단계에서 실패한다.

## 결정

사용자가 선택지는 추천안으로 진행하라고 해 아래와 같이 정했다. 이슈 코멘트에 기록했다. 중앙 저장소에는 원본이 없었다.

- 앱의 `backend/src/migrate.ts`에 둔다. 다른 앱에도 필요한지는 중앙 저장소에서 판단할 일이라 여기서 다루지 않는다.
- 모든 마이그레이션은 재실행해도 안전하다는 규칙(`database/README.md`)이 있으므로, 적용 기록 표 없이 번호 순으로 전부 다시 실행한다.

## 변경

- `backend/src/migrate.ts`: `MIGRATIONS_DIR`(기본 `/database/migrations`)의 `.sql`을 파일 이름 순으로, 파일마다 트랜잭션으로 실행한다. advisory lock으로 동시 실행을 막는다. 실패하면 그 파일을 되돌리고 멈추며, 종료 코드 1로 끝난다. 파일이 없으면 오류다.
- 앱 동작과 `deploy/remote-deploy.sh`는 바꾸지 않았다.

## 테스트

- `backend/test/migrate.test.ts`: 순서, 트랜잭션, 실패 때 멈춤, 파일 없음.
- `backend/test/db.integration.test.ts`: 빈 스키마에 전부 적용, 기존 데이터 위에 재실행.

## 검증

- 로컬: `env -u TEST_DATABASE_URL npm run check` 통과. 백엔드 109개 중 91 pass / 0 fail / 18 skip(DB 테스트), 프론트엔드 252개 중 250 pass / 0 fail / 2 skip(다크 모드 전용 공통 테스트), `test:skills` 4개 pass. 빌드한 `backend/dist/migrate.js`를 빈 폴더로 실행해 오류 메시지와 종료 코드 1을 확인했다.
- CI의 실제 DB: PR 코멘트에 적는다.
- 실제 서버 배포로는 확인하지 못했다. 배포가 연결되어 있지 않다.

## 한계·후속

- 재실행이 안전하지 않은 마이그레이션을 추가하면 이 실행기로는 맞지 않는다. 규칙이 그런 마이그레이션을 금지한다.

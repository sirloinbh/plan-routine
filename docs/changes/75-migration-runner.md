# #75 배포 스크립트의 마이그레이션 실행기 갖추기

- 이슈: [#75](https://github.com/sirloinbh/plan-routine/issues/75)
- 브랜치: `feat/75-migration-runner`
- 일자: 2026-11-01 (Asia/Seoul)

## 목적

`deploy/remote-deploy.sh`는 `node dist/migrate.js`를 실행하지만 소스가 저장소에 없었다. 배포를 연결하면 이 단계에서 실패한다.

## 결정

중앙 `sirloinbh/project-standards`의 실행기(`scaffold/app/backend/src/migrate.ts`, `migrations.ts`)와 규칙(`docs/conventions/database.md`)을 그대로 들여온다.

처음에는 "중앙에 원본이 없다"고 잘못 판단해, 기록 표 없이 전부 재실행하는 실행기를 앱에 직접 만들었다. 코드 검색이 빈 결과를 돌려준 것을 없다고 받아들인 내 실수다. 1차 리뷰에서 드러났다. 그 방식은 배포할 때마다 `004`가 다시 돌아, 사용자가 이름을 바꾼 '목표 재설정'이 되살아나는 결함도 있었다. 이슈 코멘트를 정정했다.

## 변경

- `backend/src/migrate.ts`, `migrations.ts`, `backend/test/migrations.test.ts`: 중앙 스캐폴드 그대로. 다만 `migrations.ts`의 정규식에 눈에 보이지 않는 BOM 문자가 그대로 있어 이 저장소의 lint에 걸려, 동작이 같은 이스케이프 표기로 바꿨다.
- `package.json`, `backend/package.json`: `db:migrate` 스크립트. 공통 CI가 이 이름으로 실행기를 찾아 돌린다.
- `database/README.md`: 적용 절차를 실행기 기준으로 고쳤다.
- 앱 동작과 `deploy/remote-deploy.sh`는 바꾸지 않았다. 빌드 결과 `dist/migrate.js`의 경로가 스크립트의 마운트(`/database/migrations`)와 맞는다.

## 테스트

- `backend/test/migrations.test.ts`: 이름 형식, 번호 중복, 체크섬, 적용 순서 규칙.
- `backend/test/db.integration.test.ts`: 빈 스키마에 전부 적용, 다시 돌리면 아무것도 적용하지 않음, 이름을 바꾼 기본 루틴이 되살아나지 않음, 기록 표가 없는 DB.

## 검증

- 로컬: `env -u TEST_DATABASE_URL npm run check` 통과. 백엔드 111개 중 93 pass / 0 fail / 18 skip(DB 테스트), 프론트엔드 252개 중 250 pass / 0 fail / 2 skip(다크 모드 전용 공통 테스트), `test:skills` 4개 pass. `npm run standards:check` 통과. 빌드한 `backend/dist/migrate.js`를 `DATABASE_URL` 없이 실행해 한국어 안내와 종료 코드 1을 확인했다.
- CI의 실제 DB: 백엔드 111개 모두 pass, skip 0. 공통 CI가 `npm run db:migrate`를 돌려 001~005를 기록했다(PR run 41303400481).
- 실제 서버 배포로는 확인하지 못했다. 배포가 연결되어 있지 않다.

## 한계·후속

- 기록 표가 없는 기존 DB에서는 처음 한 번 모든 파일을 다시 적용한다. 그때 '목표 재설정' 이름을 바꿔 두었다면 다시 생긴다. 중앙 규칙이 정한 동작이고, 지울 수 있다.
- 실행 중 DB 연결이 끊기면 정리 코드 없이 프로세스가 끝난다. 종료 코드는 1이고 서버가 트랜잭션과 잠금을 되돌린다. 중앙 파일을 고치지 않고 그대로 뒀다.
- `compose.yaml`이 `remote-deploy.sh`의 전제(이미지 태그, 포트 변수)를 지키지 않는 문제는 이 카드 범위 밖이라 [#79](https://github.com/sirloinbh/plan-routine/issues/79)로 분리했다.

## 자동 코드 리뷰

- 1차: "중앙에 원본이 없다"는 전제가 틀렸음과 이름을 바꾼 기본 루틴이 되살아나는 결함을 찾았다. 중앙 실행기로 교체해 둘 다 해결했다. DB 문서도 고쳤다. 배포 전제 문제는 분리했다.
- 2차: 코드와 테스트에는 결함이 없었다. 임시 PostgreSQL로 실행기를 직접 돌려 동작을 확인했다. 기존 DB 적용 절차가 낡은 문서 3곳을 고쳤다. 리뷰는 2회로 마친다.

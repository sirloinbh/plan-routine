# #3 루틴 주기·기간 계산 규칙과 DB 스키마

- 이슈: https://github.com/sirloinbh/plan-routine/issues/3
- 일자: 2026-10-22 (Asia/Seoul)

## 목적

하루·주간·4주·12주 루틴과 체크 기록을 저장할 공통 구조와 주기별 기간 계산 규칙을 만든다. 이후 카드(#4~#11)가 이 위에서 동작한다.

## 확정한 규칙 (사용자 확인, #3 코멘트 기록)

- 주는 **일요일~토요일**이다.
- 4주·12주 주기는 **앱 첫 사용일**부터 센다. 첫 사용일은 `GET /api/periods`가 처음 호출될 때 서비스 날짜로 `app_settings.routine_anchor_date`에 한 번만 저장된다.
- 4주·12주 기간이 온전한 주로 이루어지도록 기준점은 **첫 사용일이 속한 주의 일요일**로 맞췄다(구현 판단, 이슈 코멘트로 기록). 기준 이전 날짜는 앞선 기간으로 계산한다.
- 루틴 삭제는 `archived_at` 보관 처리이며 체크 기록이 있는 루틴은 DB에서 삭제할 수 없다(`ON DELETE RESTRICT`).

## 변경

- `database/migrations/002_routines.sql`: `routines`(이름 1~100자, 주기 4종, 하루 루틴만 카테고리 7종 필수, 정렬 순서, 보관 시각)와 `routine_checks`(루틴·기간 시작일 기본키로 중복 방지). 모두 `IF NOT EXISTS`로 재실행 안전.
- `backend/src/periods.ts`: 주기 목록, 날짜 검증(`calendarDate`, 한국어 메시지), `weekStart`·`periodFor`·`periodsFor`. 날짜 계산은 UTC 일 단위로 해 호스트 시간대와 무관하다.
- `backend/src/routines.ts`: 카테고리 코드·한국어 이름, 루틴 입력 Zod 스키마(한국어 오류), 첫 사용일 저장·조회 `routineAnchorDate`(`ON CONFLICT DO UPDATE` 한 쿼리로 동시 첫 호출에도 같은 값 반환).
- `backend/src/app.ts`: `GET /api/periods?date=YYYY-MM-DD` — 날짜(기본 오늘), 첫 사용일, 주기별 현재 기간 반환. 잘못된 날짜는 한국어 400.

## 테스트

- `backend/test/periods.test.ts`(단위): 주 경계(일·토), 월말·연말·윤일, 4주 28일 반복, 12주 84일과 연도 경계, 기준 이전 날짜, 존재하지 않는 날짜 거부. 작성 중 `2026-13-01`이 예외를 던지는 결함을 발견해 `isCalendarDate`를 고쳤다.
- `backend/test/routines.test.ts`(API·검증): 저장된 첫 사용일 사용과 오늘 기본값, 날짜 지정 조회, 잘못된 날짜·중복 `date` 파라미터 400, 루틴 입력 정상·오류 메시지 6종.
- `backend/test/db.integration.test.ts`(DB): 002 재실행, 카테고리·이름·주기 CHECK, 같은 기간 중복 체크 거부(23505), 체크가 있는 루틴 삭제 거부(23503), 첫 사용일 1회 저장(롤백), 동시 첫 호출 4건이 같은 날짜로 수렴(원래 값 복원).

## 검증

- 로컬 `npm run check` → **exit 0**. 앱 테스트 24개 중 **20 pass / 0 fail / 4 skip**(1차 리뷰 보완 후), 스킬 검사 4 pass.
- skip 4건은 DB 통합 테스트다. 로컬에 PostgreSQL·Docker가 없어 `TEST_DATABASE_URL`을 설정하지 못했다. GitHub Actions `verify`가 마이그레이션 적용 후 실제 DB로 실행한다(결과는 PR에 기록).
- 화면 변경 없음.

## 한계·후속

- 루틴 CRUD API·화면은 #4, 체크 API·체크리스트 화면은 #5에서 만든다.
- 첫 사용일은 현재 `GET /api/periods` 호출 시에만 저장된다. #4 루틴 생성·#5 체크 저장에서도 `routineAnchorDate`를 호출해 실제 첫 사용일보다 늦게 저장되지 않게 한다.

## 자동 코드 리뷰

- 1차: 보완 3건 반영. (중) `DO NOTHING` + `SELECT` CTE가 READ COMMITTED에서 동시 첫 호출 시 빈 결과로 500을 낼 수 있어 `ON CONFLICT DO UPDATE ... RETURNING`으로 교체하고 동시 호출 DB 테스트 추가. (낮) 첫 사용일 저장 시점을 한계·후속에 기록. (낮) 중복 `date` 파라미터 400 테스트 추가.
- 2차: 차단 결함 없음. 1차 보완 3건 반영을 확인했다. 선택 지적(no-op `DO UPDATE`가 호출마다 행 버전을 새로 쓰고 잠금을 잡음)은 1인 서비스 규모에서 영향이 없어 반영하지 않았다. 리뷰는 2회로 마친다.

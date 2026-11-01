# #12 루틴 항목에서 다른 프로젝트 웹앱으로 링크 이동

- 이슈: [#12](https://github.com/sirloinbh/plan-routine/issues/12)
- 브랜치: `feat/12-project-links`
- 일자: 2026-11-01 (Asia/Seoul)

## 목적

가계부나 독서 기록처럼 다른 개인 웹앱에서 처리하는 루틴을 체크리스트에서 바로 연다.

## 결정

사용자가 선택지는 추천안으로 진행하라고 해 아래와 같이 정했다. 이슈 코멘트에 기록했다.

- 허용 주소는 카드의 추천안대로 `https://`와 사설 접속 주소만이다. `http://`는 사설 주소(localhost, 127/8, 10/8, 172.16/12, 192.168/16, 100.64/10, `.local`, `.localhost`, `.internal`, `.home.arpa`, `.ts.net`, `[::1]`, `[fc00::/7]`)에만 허용한다. `javascript:` 등과 사용자 정보가 든 주소는 거부한다.
- 프로젝트 목록은 설정 화면에서 추가하고 지운다. 이름이 같은 프로젝트는 거부한다. 고치려면 지우고 다시 추가한다.
- 루틴 하나에 프로젝트 하나를 연결한다. 프로젝트를 지우면 연결만 풀리고 루틴은 그대로다.
- 링크는 오늘 체크와 주간·4주·12주 체크리스트처럼 체크리스트 부품을 쓰는 모든 곳에 나온다.

## 변경

- `database/migrations/006_project_links.sql`: `project_links` 표, `routines.project_link_id`. **기존 DB에는 `npm run db:migrate`로 적용해야 한다.**
- `backend/src/project-link-routes.ts`(새 파일): 목록, 추가, 삭제, 주소 검증.
- `backend/src/routine-routes.ts`: `PUT /api/routines/:id/project-link`, 루틴 응답의 `projectLinkId`.
- `backend/src/check-routes.ts`: 체크리스트 항목의 `linkName`, `linkUrl`.
- `frontend/src/project-links.tsx`(새 파일), `app.tsx`: 설정 화면의 프로젝트 목록.
- `frontend/src/routine-list.tsx`, `use-routine-list.ts`: 루틴마다 연결할 프로젝트 선택. 프로젝트가 없으면 보이지 않는다.
- `frontend/src/checklist.tsx`: 새 탭 링크(`rel="noopener noreferrer"`). 저장된 주소가 http·https가 아니면 링크로 만들지 않는다.

## 테스트

- `backend/test/project-link-routes.test.ts`: 허용·거부 주소, 입력 오류, 연결 설정과 해제.
- `backend/test/db.integration.test.ts`: 체크리스트까지의 전달, 이름 중복, 프로젝트 삭제.
- `frontend/src/project-links.test.tsx`, `routines.test.tsx`: 목록, 추가, 거부, 삭제와 포커스, 체크리스트 링크, 연결 선택.

## 검증

- 로컬: `env -u TEST_DATABASE_URL npm run check` 통과. 백엔드 145개 중 126 pass / 0 fail / 19 skip(DB 테스트), 프론트엔드 264개 중 262 pass / 0 fail / 2 skip(다크 모드 전용 공통 테스트), `test:skills` 4개 pass.
- 브라우저: 임시 API와 헤드리스 Chrome으로 PC 1440×900, 모바일 390×844에서 나쁜 주소 거부, 프로젝트 추가, 루틴 연결, 오늘 체크의 새 탭 링크(`noopener noreferrer`)를 확인했다. 긴 주소도 넘치지 않았고 콘솔 오류와 가로 스크롤은 없었다. 실제 DB, 실제 휴대폰, 실제 링크 이동으로는 확인하지 못했다.
- CI의 실제 DB: PR 코멘트에 적는다.

## 한계·후속

- 프로젝트 이름과 주소를 고치는 화면은 없다. 지우고 다시 추가해야 하며, 그러면 연결이 풀린다.

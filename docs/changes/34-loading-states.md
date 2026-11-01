# #34 불러오는 중 표시를 공통 Skeleton·Spinner로 바꾸기

- 이슈: [#34](https://github.com/sirloinbh/plan-routine/issues/34)
- 브랜치: `chore/34-loading-states`
- 일자: 2026-11-01 (Asia/Seoul)

## 목적

기능 화면이 "불러오는 중" 글자만 보여 줬다. 중앙 규칙(`sirloinbh/project-standards`의 `docs/ui-components.md`)대로 바꾼다.

## 변경

- `frontend/src/loading-region.tsx`(새 파일): `SkeletonList`를 `aria-busy`와 이름이 있는 영역으로 감싼다. 오늘 체크, 하루·기간 루틴, 일기, 기록, 달성률, 12주 목표, 연결 패널, 프로젝트 목록의 글자를 이것으로 바꿨다.
- 저장·삭제 버튼에 `Spinner size="sm"`을 넣었다: 루틴 추가·이름 저장·보관 확인, 목표 추가·저장·삭제 확인, 프로젝트 추가·삭제 확인, 일기 저장, 회고 저장, 연결 저장.

## 결정

일기 저장, 회고 저장, 연결 저장 버튼은 `disabled`를 주지 않고 전처럼 코드로 중복을 막는다. 이슈에는 `disabled`라고 적혀 있지만, 이 셋은 포커스를 유지하려고 일부러 비활성화하지 않는 버튼이다(#19, #41). 나머지는 이미 `disabled`다.

## 테스트

`loading-region.test.tsx`, `diary.test.tsx`, `records.test.tsx`.

## 검증

- 로컬: `env -u TEST_DATABASE_URL npm run check` 통과. 백엔드 161개 중 142 pass / 0 fail / 19 skip(DB 테스트), 프론트엔드 269개 중 267 pass / 0 fail / 2 skip, `test:skills` 4개 pass.
- 브라우저: 응답하지 않는 임시 API와 헤드리스 Chrome으로 데스크톱 1440×900, 375×812에서 오늘 체크, 하루 루틴, 일기, 기록, 달성률, 12주, 설정의 불러오는 중 상태를 확인했다. 각 화면에 이름 있는 `aria-busy` 영역이 나오고, "불러오는 중" 글자와 가로 스크롤은 없었다. 저장 버튼의 Spinner는 화면 테스트로만 확인했다.

## 한계·후속

없음.

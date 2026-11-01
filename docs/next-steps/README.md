# 다음 작업

최종 갱신일: **2026-11-01 (Asia/Seoul)**.

기본 기능의 처음 카드 목록은 로드맵 [#14](https://github.com/sirloinbh/plan-routine/issues/14)에 있다. 지금 상태는 이 문서와 이슈 목록을 기준으로 본다. 끝난 기능 카드: #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #19, #34, #41, #42, #44, #45, #47, #52, #60, #64, #66, #70, #73, #75, #76, #87.

## 내일 할 일

순서대로 진행한다. 1~4번은 사용자가 직접 하거나 정할 일이다.

1. **임시 브랜치 지우기.** `git branch -D tmp/42-no-lock`을 실행한다. 병합되지 않은 실험 커밋 하나뿐이고, 에이전트의 명령은 권한에서 막혔다.
2. **#79 확인.** Docker를 켜고 `docker compose up -d --build`가 전처럼 동작하는지 본다. 첫 실행은 이미지 이름이 바뀌어 다시 빌드하므로 셸에 `NODE_AUTH_TOKEN`이 필요하다. 첫 초기화 소요 시간도 본다(헬스 체크 여유 약 75초). 문제가 없으면 [#79](https://github.com/sirloinbh/plan-routine/issues/79)를 닫는다.
3. **기존 DB 적용.** 이미 쓰던 DB가 있으면 `npm run db:migrate`를 실행한다. 005, 006이 없으면 12주 화면, 루틴 목록, 체크리스트가 실패한다. 첫 실행은 모든 파일을 다시 적용하므로, 이름을 바꾼 '목표 재설정'이 있으면 원래 이름의 항목이 다시 생길 수 있다.
4. **추천안으로 정한 결정 확인.** 외출 중 추천안으로 정한 내용이다. 각 이슈 코멘트에 있고, 다르게 원하면 새 카드로 바꾼다.
   - [#52](https://github.com/sirloinbh/plan-routine/issues/52): 목표 하나에 하루·주간 루틴 여러 개 연결. 지난 기간 카드에는 표시하지 않음.
   - [#12](https://github.com/sirloinbh/plan-routine/issues/12): `https://`와 사설 주소만 허용. 프로젝트 이름·주소를 고치는 화면은 없음.
   - [#64](https://github.com/sirloinbh/plan-routine/issues/64): 일기 임시 글은 탭끼리 하나를 공유하고, 덮어쓰이면 앞 탭에 경고.
   - [#45](https://github.com/sirloinbh/plan-routine/issues/45): 탭 닫기 경고는 임시 저장에 실패했을 때만.
   - [#34](https://github.com/sirloinbh/plan-routine/issues/34): 일기·회고·연결 저장 버튼은 포커스를 지키려고 `disabled`를 쓰지 않음.
   - [#66](https://github.com/sirloinbh/plan-routine/issues/66): 다시 시도 뒤 포커스는 제목이 아니라 제목으로 이름 붙은 영역으로.
5. **#13 진행 여부 정하기.** [#13](https://github.com/sirloinbh/plan-routine/issues/13) 통합 허브 설계는 "매우 후순위"이고, 완료 기준이 "사용자 확인을 받는다"라서 추천안으로 대신할 수 없다. 진행하기로 하면 설계 문서부터 만든다.
6. **가능하면 실제 환경 확인.** 실제 DB에 연결한 화면, 실제 휴대폰과 화면 낭독기, 다크 모드의 연결 선택칸, 탭 닫기 경고 창, 목표·회고·연결·이름 저장 버튼의 Spinner를 아직 보지 못했다.

열린 카드는 #79, #13뿐이다. 중앙 저장소에는 [project-standards#392](https://github.com/sirloinbh/project-standards/issues/392)가 있다.

## 열려 있는 PR

없음.

## 알아 둘 점

- **로컬 테스트 전에 `TEST_DATABASE_URL`을 지운다.** 셸의 이 변수가 다른 프로젝트 DB(`study_test`)를 가리킨다. 2026-10-31에 테스트가 그 DB에 빈 테이블 2개를 만들어, 사용자 승인으로 지웠다. 이 프로젝트의 테스트 DB는 `plan_test`다.
- **로컬 프론트엔드 테스트가 시간 초과로 실패하면 `--testTimeout=60000`을 붙인다.** 2026-11-01 후반에는 `npm run check`가 기본 제한으로 통과했지만, PC가 바쁘면 시간 초과가 날 수 있다.
- **"오늘 체크"와 "기록"의 지난 날짜 진행률은 다를 수 있다.** 오늘 체크는 나중에 만든 루틴도 지난 날짜에 체크할 수 있게 지금 있는 루틴을 모두 보여 주고, 기록은 그날 있던 루틴을 센다(#10).
- **실제 DB에 연결한 화면 확인을 아직 못 했다.** 로컬에 이 프로젝트의 DB가 없어 #4 이후 브라우저 확인은 임시 API로 했다. API·DB 동작은 CI의 DB 통합 테스트로 확인한다.
- **기존 DB에는 `npm run db:migrate`로 적용한다.** 기록 표가 없는 DB의 첫 실행은 001부터 모두 다시 적용하므로, 이름을 바꾼 '목표 재설정'이 다시 생길 수 있다. 절차는 [DB 문서](../../database/README.md)에 있다.
- **이전의 간헐 실패 원인을 찾았다.** 백엔드 테스트의 `fetch failed: bad port`는 임의 포트가 `fetch`가 막는 포트일 때 생겼고 #47에서 고쳤다.
- **CodeQL `js/missing-rate-limiting` 경고는 에이전트가 닫는다.** 사용자가 2026-10-31에 승인했다. 사유는 `frontend/nginx.conf`의 `/api/` 요청 제한이고, 다른 규칙의 경고는 사용자에게 묻는다.
- **병합 명령은 앞선 작업의 결과를 본 뒤 단독으로 실행한다.** 병렬로 실행해 수정 전 커밋이 병합된 적이 있다(#85).

## 라벨

- 우선순위: `priority/P0`~`priority/P4`. 기준은 `std-backlog` 2장에 있다.
- 종류: `type/feature`, `type/docs`, `type/security`, `type/chore`, `type/research`
- 기능: `기능: 루틴`, `기능: 체크리스트`, `기능: 일기`, `기능: 기록·열람`, `기능: 프로젝트 연계`
- 작업 성격: `작업: DB`, `작업: API`, `작업: UI`, `작업: 설계`
- 기타: `추적`(여러 카드를 묶는 이슈), `accessibility`

## 실행 경계

배포, 하위 저장소 동기화, AWS 리소스 생성은 별도 요청 시에만 한다. 공유 인프라의 ECR 저장소는 첫 배포 때 `shared-aws-infrastructure`의 목록에 추가한다.

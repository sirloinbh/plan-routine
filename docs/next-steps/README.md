# 다음 작업

최종 갱신일: **2026-10-31 (Asia/Seoul)**.

기본 기능의 처음 카드 목록은 로드맵 [#14](https://github.com/sirloinbh/plan-routine/issues/14)에 있다. 지금 상태는 이 문서와 이슈 목록을 기준으로 본다. 끝난 기능 카드: #3, #4, #5, #6, #7, #9, #44.

## 내일 할 일

순서는 우선순위, 그다음 이슈 번호다(`std-backlog` 5장). 예외로 사용자가 매우 후순위로 지정한 #12, #13은 같은 P3 안에서 뒤로 뺐다. 다른 지시가 없으면 1번부터 진행한다.

| 순서 | 이슈                                                       | 할 일                                             | 우선순위 | 착수 전 확인                                                                                                               |
| ---- | ---------------------------------------------------------- | ------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1    | [#8](https://github.com/sirloinbh/plan-routine/issues/8)   | 12주 루틴: 목표 재설정과 회고                     | P2       | 없음. 목표와 루틴을 연결하지 않기로 확정했고, 연결은 [#52](https://github.com/sirloinbh/plan-routine/issues/52)로 분리했다 |
| 2    | [#10](https://github.com/sirloinbh/plan-routine/issues/10) | 날짜별 기록 열람                                  | P2       | 일기 진행률을 그날 있던 루틴 기준으로 집계할지 (#10 코멘트)                                                                |
| 3    | [#11](https://github.com/sirloinbh/plan-routine/issues/11) | 루틴별 이력과 달성률 열람                         | P2       | 카드의 확인 항목                                                                                                           |
| 4    | [#19](https://github.com/sirloinbh/plan-routine/issues/19) | 하루 루틴 수정·보관 후 키보드 포커스 복귀         | P2       | 없음                                                                                                                       |
| 5    | [#45](https://github.com/sirloinbh/plan-routine/issues/45) | 저장하지 않은 일기를 두고 떠날 때 안내            | P2       | 메뉴 이동을 막는 방법(라우터 구조 변경 또는 임시 저장)                                                                     |
| 6    | [#41](https://github.com/sirloinbh/plan-routine/issues/41) | 날짜 이동 후 키보드 포커스 유지 (일기 화면 포함)  | P3       | 없음                                                                                                                       |
| 7    | [#42](https://github.com/sirloinbh/plan-routine/issues/42) | 보관과 체크의 동시 요청 DB 테스트                 | P3       | 없음                                                                                                                       |
| 8    | [#47](https://github.com/sirloinbh/plan-routine/issues/47) | 잘못된 요청 본문에 한국어 오류로 답하기           | P3       | 없음                                                                                                                       |
| 9    | [#52](https://github.com/sirloinbh/plan-routine/issues/52) | 12주 목표를 하루·주간 루틴과 연결                 | P3       | #8 이후. 연결 방식                                                                                                         |
| 10   | [#12](https://github.com/sirloinbh/plan-routine/issues/12) | [후순위] 다른 프로젝트 웹앱으로 링크 이동         | P3       | 카드의 확인 항목(허용 URL). 사용자가 매우 후순위로 지정                                                                    |
| 11   | [#13](https://github.com/sirloinbh/plan-routine/issues/13) | [후순위] 다른 프로젝트 통합 허브 설계             | P3       | [#12](https://github.com/sirloinbh/plan-routine/issues/12) 이후                                                            |
| 12   | [#34](https://github.com/sirloinbh/plan-routine/issues/34) | 불러오는 중 표시를 공통 Skeleton·Spinner로 바꾸기 | P4       | 없음                                                                                                                       |

각 카드의 "확인 필요 (추천안)" 항목은 착수 전에 사용자 확인을 받아 이슈 코멘트로 기록한다.

## 열려 있는 PR

에이전트가 만들지 않은 PR이다. 내일 상태를 확인한다.

- [#54](https://github.com/sirloinbh/plan-routine/pull/54): 중앙 표준 동기화.
- [#32](https://github.com/sirloinbh/plan-routine/pull/32): dependabot 보안 메이저 업데이트. 2026-10-28부터 열려 있다.

## 알아 둘 점

- **로컬 테스트 전에 `TEST_DATABASE_URL`을 지운다.** 셸의 이 변수가 다른 프로젝트 DB(`study_test`)를 가리킨다. 2026-10-31에 테스트가 그 DB에 빈 테이블 2개를 만들어, 사용자 승인으로 지웠다. 이 프로젝트의 테스트 DB는 `plan_test`다.
- **로컬 프론트엔드 테스트는 `--testTimeout=60000`을 붙인다.** 이 PC에서는 기본 5초 제한으로 시간 초과가 날 수 있다. CI는 기본 제한으로 통과한다. `npm run check`는 그래서 로컬에서 실패할 수 있다.
- **실제 DB에 연결한 화면 확인을 아직 못 했다.** 로컬에 이 프로젝트의 DB가 없어 #4 이후 브라우저 확인은 임시 API로 했다. API·DB 동작은 CI의 DB 통합 테스트로 확인한다.
- **기존 DB에는 `003_diary.sql`을 적용해야 한다.** 절차는 [DB 문서](../../database/README.md)에 있다.
- **간헐 실패 1건:** `diary-routes.test.ts`의 "saving trims the text"가 2026-10-31에 한 번 실패했고 이후 40회 실행에서 재현되지 않았다. 원인은 모른다. 다시 실패하면 출력을 남긴다.
- **CodeQL `js/missing-rate-limiting` 경고는 에이전트가 닫는다.** 사용자가 2026-10-31에 승인했다. 사유는 `frontend/nginx.conf`의 `/api/` 요청 제한이고, 다른 규칙의 경고는 사용자에게 묻는다.

## 라벨

- 우선순위: `priority/P0`~`priority/P4`. 기준은 `std-backlog` 2장에 있다.
- 종류: `type/feature`, `type/docs`, `type/security`, `type/chore`, `type/research`
- 기능: `기능: 루틴`, `기능: 체크리스트`, `기능: 일기`, `기능: 기록·열람`, `기능: 프로젝트 연계`
- 작업 성격: `작업: DB`, `작업: API`, `작업: UI`, `작업: 설계`
- 기타: `추적`(여러 카드를 묶는 이슈), `accessibility`

## 실행 경계

배포, 하위 저장소 동기화, AWS 리소스 생성은 별도 요청 시에만 한다. 공유 인프라의 ECR 저장소는 첫 배포 때 `shared-aws-infrastructure`의 목록에 추가한다.

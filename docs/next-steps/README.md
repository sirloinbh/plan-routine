# 다음 작업

최종 갱신일: **2026-10-22 (Asia/Seoul)**.

기본 기능 요구사항을 이슈카드로 등록했다. 전체 목록과 진행 상황은 로드맵 [#14](https://github.com/sirloinbh/plan-routine/issues/14)에서 추적한다.

## 우선 처리

| 순서 | 이슈                                                       | 할 일                                     | 우선순위       | 선행   |
| ---- | ---------------------------------------------------------- | ----------------------------------------- | -------------- | ------ |
| 1    | [#3](https://github.com/sirloinbh/plan-routine/issues/3)   | 루틴 주기·기간 계산 규칙과 DB 스키마(002) | P0 선행 필수   | —      |
| 2    | [#4](https://github.com/sirloinbh/plan-routine/issues/4)   | 하루 루틴 항목 관리                       | P1 높음        | #3     |
| 3    | [#5](https://github.com/sirloinbh/plan-routine/issues/5)   | 체크리스트 화면과 오늘의 하루 루틴 체크   | P1 높음        | #4     |
| 4    | [#9](https://github.com/sirloinbh/plan-routine/issues/9)   | 일기 쓰기(오늘 하루 피드백)               | P1 높음        | —      |
| 5    | [#6](https://github.com/sirloinbh/plan-routine/issues/6)   | 주간 루틴                                 | P2 보통        | #3, #5 |
| 6    | [#7](https://github.com/sirloinbh/plan-routine/issues/7)   | 4주 루틴                                  | P2 보통        | #3, #5 |
| 7    | [#8](https://github.com/sirloinbh/plan-routine/issues/8)   | 12주 루틴: 목표 재설정과 회고             | P2 보통        | #3, #5 |
| 8    | [#10](https://github.com/sirloinbh/plan-routine/issues/10) | 날짜별 기록 열람                          | P2 보통        | #5, #9 |
| 9    | [#11](https://github.com/sirloinbh/plan-routine/issues/11) | 루틴별 이력과 달성률 열람                 | P2 보통        | #5~#7  |
| 10   | [#12](https://github.com/sirloinbh/plan-routine/issues/12) | 다른 프로젝트 웹앱 링크 이동              | P3 매우 후순위 | —      |
| 11   | [#13](https://github.com/sirloinbh/plan-routine/issues/13) | 다른 프로젝트 통합 허브 설계              | P3 매우 후순위 | #12    |

각 카드의 "확인 필요 (추천안)" 항목은 착수 전에 사용자 확인을 받아 이슈 코멘트로 기록한다.

## 라벨

- 우선순위: `P0 선행 필수`, `P1 높음`, `P2 보통`, `P3 매우 후순위`
- 기능: `기능: 루틴`, `기능: 체크리스트`, `기능: 일기`, `기능: 기록·열람`, `기능: 프로젝트 연계`
- 작업 성격: `작업: DB`, `작업: API`, `작업: UI`, `작업: 설계`
- 기타: `추적`(여러 카드를 묶는 이슈)

## 실행 경계

배포, 하위 저장소 동기화, AWS 리소스 생성은 별도 요청 시에만 한다. 공유 인프라의 ECR 저장소는 첫 배포 때 `shared-aws-infrastructure`의 목록에 추가한다.

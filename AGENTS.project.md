# 계획·실천·루틴·피드백 고유 지침

이 파일은 plan-routine에만 해당하는 규칙이다. 공통 지침은 [AGENTS.md](AGENTS.md)이며, 중앙 표준(`sirloinbh/project-standards`) 동기화 후에는 중앙 관리 파일이 된다. 두 파일이 다르면 이 파일이 우선한다.

## 작업 절차 (공통 절차에 더해)

- **PR을 올린 뒤 자동 코드 리뷰를 최대 2회 거친다.** 리뷰에서 보완점이 나오면 추가 커밋으로 반영하고, 1차 보완 후에는 2차 리뷰를 한 번 더 받는다. 2차 보완 커밋 뒤에는 더 리뷰하지 않는다. 보완점이 없으면 바로 다음 단계로 간다. 이 PR에서 고치기에 큰 수정은 새 이슈카드로 분리한다. 상세 절차는 [plan-routine-implementation](skills/plan-routine-implementation/SKILL.md)의 5단계를 따른다.
- **그 뒤 최종 head의 필수 CI 검사가 모두 통과하면 에이전트(주 에이전트·로컬 워커)가 묻지 않고 병합한다.** `scripts/gh-project.ps1 pr merge <url> --merge --match-head-commit <검증한 head SHA>`(merge commit)를 사용하고 연결 이슈(`Closes #N`)가 닫혔는지 확인한다. 연속 PR은 순서대로 병합한다. 앞 PR 병합 후 다음 PR 브랜치에 `origin/main`을 병합해 충돌을 해결하고 관련 테스트를 다시 실행해 일반 푸시(force 금지)한 뒤 CI 통과 후 병합한다. 실패·실행 중 검사가 있는 병합, `--admin` 등 브랜치 보호 우회, 자기 PR 승인으로 검토 대체, `main` 직접 커밋·푸시, force push는 하지 않는다. 현재 `main` 병합은 배포를 트리거하지 않는다(배포 미연결). 자동 배포를 연결하면 병합 후 배포 결과 확인 절차를 이 항목에 추가한다.

## 고유 스킬

- [plan-routine-implementation](skills/plan-routine-implementation/SKILL.md), [plan-routine-testing](skills/plan-routine-testing/SKILL.md), [plan-routine-foundation](skills/plan-routine-foundation/SKILL.md): 이 프로젝트의 리뷰·병합 절차가 들어 있어 공통 스킬(std-*)이 들어온 뒤에도 유지한다.

## 서비스 규칙

- 아직 없다. 이 프로젝트에만 해당하는 도메인 규칙이 생기면 여기에 적는다.

# #1 에이전트 PR 자동 병합 정책으로 변경

- 이슈: https://github.com/sirloinbh/plan-routine/issues/1
- 일자: 2026-10-21 (Asia/Seoul)

## 목적

저장소 소유자가 2026-10-21 병합 정책 변경을 명시적으로 지시했다. "PR 병합은 사용자만 수행한다" 규칙을 CI 통과 후 에이전트가 병합하는 정책으로 바꿔, 프로젝트마다 병합을 반복 요청하지 않게 한다.

## 변경

- 새 정책: 필수 CI 검사가 모두 통과하면 에이전트(주 에이전트·로컬 워커)가 묻지 않고 `scripts/gh-project.ps1 pr merge <url> --merge --match-head-commit <head SHA>`로 merge commit 병합하고, 연결 이슈가 닫혔는지 확인한다.
- 연속 PR: 순서대로 병합한다. 앞 PR 병합 후 다음 PR 브랜치에 `origin/main`을 병합해 충돌을 해결하고 관련 테스트를 다시 실행해 일반 푸시(force 금지)한 뒤 CI 통과 후 병합한다.
- 계속 금지: 실패·실행 중 검사가 있는 병합, `--admin` 등 브랜치 보호 우회, 자기 PR 승인으로 검토 대체, `main` 직접 커밋·푸시, force push.
- 배포: 현재 `main` 병합은 배포를 트리거하지 않으므로(배포 미연결) 병합 후 배포 확인은 해당 없음을 AGENTS.md·구현 스킬에 명시했다.
- 수정 파일: `AGENTS.md`, `README.md`, `docs/project-setup.md`(절대 규칙 2, Git 전략 순서·병합 항목, 파일 역할 표, AGENTS.md 템플릿), `skills/plan-routine-{implementation,foundation,testing}/SKILL.md`(구현 스킬 머리말 description 포함), `.claude/skills/` 복제본(`npm run skills:sync`).
- `docs/project-setup.md`의 "squash merge 추천"은 새 정책(merge commit)에 맞춰 교체했다.
- 과거 기록(`docs/changes/bootstrap.md`, `docs/daily`)은 수정하지 않았다. 병합 정책을 검사하는 스크립트·테스트는 저장소에 없어 수정 대상이 없었다.

## 검증

- `npm run skills:sync` → `Copied skills/ to .claude/skills/.`
- `npm run test:skills` → **4 pass / 0 fail / 0 skip** (복제본 일치 포함)
- skill-creator `quick_validate.py`(UTF-8 모드 `python -X utf8`) 3개 스킬 → 모두 `Skill is valid!`
- Prettier 3.9.10(저장소 고정 버전과 동일, 로컬 `node_modules` 미설치로 workout-memo의 설치본 사용) `--check` 변경 파일 → 통과
- 문서·스킬만 변경되어 앱 테스트는 추가하지 않았다. 로컬 `node_modules`가 없고 패키지 설치는 사용자 재확인 대상이라 로컬 `npm run check` 전체는 실행하지 않았다. 전체 검사는 GitHub Actions `verify`(`npm run check`)·`docker-build`로 확인한다.

## 2026-10-21 — PR 후 자동 리뷰(최대 2회)

### 목적

저장소 소유자가 같은 날 병합 정책을 보완했다. CI 통과 후 바로 병합하지 않고, PR을 올린 뒤 자동 코드 리뷰를 최대 2회 거쳐 보완점을 반영한 다음 최종 head의 CI 통과를 확인하고 병합하게 한다.

### 변경

- 새 정책: PR을 올린 뒤 자동 코드 리뷰를 최대 2회 거친다(리뷰 → 보완 커밋 → 2차 리뷰 → 보완 커밋). 2차 보완 커밋 뒤에는 더 리뷰하지 않는다. 보완점이 없으면 바로 CI 확인으로 간다. 이 PR에서 고치기에 큰 수정(요청 범위 밖 기능, 설계·데이터 구조 변경, 여러 모듈 수정, 별도 검증 필요)은 새 이슈카드로 분리한다. 분리하면 main이 깨지는 결함이나 보안·데이터 손상 위험 결함이 남으면 병합하지 않고 사용자에게 알린다. 그 뒤 최종 head의 필수 CI 검사가 모두 통과하면 `--merge --match-head-commit <검증한 SHA>`로 병합한다. 리뷰 중 새 커밋이 생기면 이전 CI 결과로 병합하지 않는다.
- `skills/plan-routine-implementation/SKILL.md`: "5. PR 후 자동 코드 리뷰(최대 2회)" 단계를 "테스트 후 PR 생성"과 "CI 통과 후 병합" 사이에 추가하고 병합 단계를 6으로 바꿨다. 머리말 description과 도입 문장을 새 순서로 갱신했다.
- `AGENTS.md` 절차: 5단계를 자동 리뷰 요약으로, 병합을 6단계로 나눴다. 기존 금지 사항(실패·실행 중 검사 병합, `--admin`, 자기 승인, main 직접 푸시, force push)과 연속 PR 처리는 유지했다.
- 한 줄 언급 갱신: `README.md`, `docs/project-setup.md`(절대 규칙 2, Git 전략 순서·리뷰·병합 항목, 파일 역할 표, AGENTS.md 템플릿), `skills/plan-routine-{foundation,testing}/SKILL.md`, `.claude/skills/` 복제본(`npm run skills:sync`).
- 과거 기록(이 파일의 앞 절, `docs/changes/bootstrap.md`, `docs/daily`)은 수정하지 않았다.

### 검증

- `npm run skills:sync` → `Copied skills/ to .claude/skills/.`
- `npm run test:skills` → **4 pass / 0 fail / 0 skip** (복제본 일치 포함)
- skill-creator `quick_validate.py`(`python -X utf8`) 3개 스킬 → 모두 `Skill is valid!`
- Prettier 3.9.10(저장소 고정 버전과 동일, 로컬 `node_modules` 미설치로 workout-memo의 설치본 사용) `--check` 변경 파일 → `docs/project-setup.md` 표 정렬 경고 1건을 `--write`로 고친 뒤 통과
- 문서·스킬만 변경되어 앱 테스트는 추가하지 않았다. 패키지 설치는 사용자 확인 대상이라 로컬 `npm run check` 전체(lint·typecheck·build)는 실행하지 않았다. 전체 검사는 GitHub Actions로 확인한다.

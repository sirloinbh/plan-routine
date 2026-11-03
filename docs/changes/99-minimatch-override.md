# #99 minimatch 취약점 경고 해결 (개발 도구)

- 이슈: [#99](https://github.com/sirloinbh/plan-routine/issues/99)
- 브랜치: `fix/99-minimatch-override`
- 일자: 2026-11-03 (Asia/Seoul)

## 목적

Dependabot 경고 #7을 해결한다. 대상은 `minimatch` 10.2.6이고, glob 패턴으로 CPU·메모리를 과도하게 쓰게 할 수 있다(GHSA-g3hv-75wg-m249, 중간 등급, `< 11.0.1`). 개발 도구(`eslint`, `@eslint/config-array`, `@typescript-eslint/typescript-estree`, `eslint-plugin-jsx-a11y-x`)만 쓰고, 배포되는 앱에는 들어가지 않는다.

## 결정

- 10.x에는 고친 버전이 없다. 최신 ESLint 10.14.0도 `^10.2.6`을 요구하므로, ESLint를 올려서는 해결되지 않는다.
- ESLint 계열 버전은 중앙 관리 필드(`.standards/manifest.json`)라 바꾸지 않는다. 관리 대상이 아닌 `overrides`로 11.0.4를 지정한다.
- 패키지별로 나누지 않고 저장소 전체에 적용한다. 지금 `minimatch`를 쓰는 패키지는 위 넷뿐이고, 나중에 들어오는 패키지도 취약한 버전을 받지 않게 하려는 것이다. 다른 메이저 버전이 필요한 패키지가 들어와 깨지면 그때 패키지별로 나눈다.
- 저장소 규칙(`save-exact=true`)에 맞춰 범위가 아닌 정확한 버전으로 적는다.

## 변경

- `package.json`: `"overrides": { "minimatch": "11.0.4" }`.
- `package-lock.json`: 사용자가 `npm install`로 갱신했다. `minimatch` 11.0.4와 새 의존성 `@isaacs/nonrecursive-glob-match` 1.0.3(같은 작성자)이 들어왔다. `npm run lockfiles:sync` 결과 하위 lockfile은 바꿀 것이 없었다.

## 검증

- `npm ls minimatch --all`: 네 곳 모두 11.0.4.
- 로컬: `env -u TEST_DATABASE_URL npm run check` 통과. 백엔드 164개 중 145 pass / 0 fail / 19 skip(DB 테스트), 프론트엔드 306개 중 304 pass / 0 fail / 2 skip, `test:skills` 4개 pass. `npm run standards:check` 통과.
- lint가 비어서 통과한 것이 아님을 확인했다. ESLint가 127개 파일을 검사했고, 추적 중인 소스 135개 중 빠진 8개는 모두 설정에서 제외한 `.standards/**`다.

## 한계·후속

- ESLint가 `minimatch` 11을 받아들이면 `overrides`를 지운다: [#101](https://github.com/sirloinbh/plan-routine/issues/101).
- 다른 저장소도 같은 ESLint 버전을 쓰면 같은 경고가 있을 수 있다. 확인하지 않았다.

## 자동 코드 리뷰

- 1차: 6건 중 1건을 반영했다. (낮음) 임시 조치를 지울 카드가 없었다. #101로 등록했다. 전체 적용과 정확한 버전은 선택 이유를 결정에 적었다. lint는 파일 수만이 아니라 빠진 파일이 제외 목록과 같음을 확인했다. 다음 작업 문서의 상태는 병합 뒤 기준이고, 하위 패키지는 `minimatch`를 쓰지 않아 반영하지 않았다. 문서만 고쳐 2차 리뷰는 하지 않는다.

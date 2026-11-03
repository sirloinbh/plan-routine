# #99 minimatch 취약점 경고 해결 (개발 도구)

- 이슈: [#99](https://github.com/sirloinbh/plan-routine/issues/99)
- 브랜치: `fix/99-minimatch-override`
- 일자: 2026-11-03 (Asia/Seoul)

## 목적

Dependabot 경고 #7을 해결한다. 대상은 `minimatch` 10.2.6이고, glob 패턴으로 CPU·메모리를 과도하게 쓰게 할 수 있다(GHSA-g3hv-75wg-m249, 중간 등급, `< 11.0.1`). 개발 도구(`eslint`, `@eslint/config-array`, `@typescript-eslint/typescript-estree`, `eslint-plugin-jsx-a11y-x`)만 쓰고, 배포되는 앱에는 들어가지 않는다.

## 결정

- 10.x에는 고친 버전이 없다. 최신 ESLint 10.14.0도 `^10.2.6`을 요구하므로, ESLint를 올려서는 해결되지 않는다.
- ESLint 계열 버전은 중앙 관리 필드(`.standards/manifest.json`)라 바꾸지 않는다. 관리 대상이 아닌 `overrides`로 11.0.4를 지정한다.

## 변경

- `package.json`: `"overrides": { "minimatch": "11.0.4" }`.
- `package-lock.json`: 사용자가 `npm install`로 갱신했다. `minimatch` 11.0.4와 새 의존성 `@isaacs/nonrecursive-glob-match` 1.0.3(같은 작성자)이 들어왔다. `npm run lockfiles:sync` 결과 하위 lockfile은 바꿀 것이 없었다.

## 검증

- `npm ls minimatch --all`: 네 곳 모두 11.0.4.
- 로컬: `env -u TEST_DATABASE_URL npm run check` 통과. 백엔드 164개 중 145 pass / 0 fail / 19 skip(DB 테스트), 프론트엔드 306개 중 304 pass / 0 fail / 2 skip, `test:skills` 4개 pass. `npm run standards:check` 통과.
- lint가 비어서 통과한 것이 아님을 확인했다. ESLint가 127개 파일을 검사했고, 추적 중인 소스 135개 중 빠진 8개는 모두 설정에서 제외한 `.standards/**`다.

## 한계·후속

- 다른 저장소도 같은 ESLint 버전을 쓰면 같은 경고가 있을 수 있다. ESLint가 `minimatch` 11을 받아들이면 `overrides`를 지운다.

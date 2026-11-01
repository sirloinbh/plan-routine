# #79 compose.yaml을 배포 스크립트의 전제에 맞추기

- 이슈: [#79](https://github.com/sirloinbh/plan-routine/issues/79)
- 브랜치: `chore/79-compose-deploy`
- 일자: 2026-11-01 (Asia/Seoul)

## 목적

`deploy/remote-deploy.sh`는 커밋별 이미지 태그와 포트 변수를 전제로 하는데 `compose.yaml`에 없었다. 헬스 체크가 실패하면 방금 올린 이미지로 다시 떠서, 되돌리기가 동작하지 않았다.

## 변경

`compose.yaml`만 바꿨다.

- api, web에 `image: plan-backend:${IMAGE_TAG:-local}`, `plan-frontend:${IMAGE_TAG:-local}`.
- web 포트를 `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8107}:80`으로. 기본값은 지금과 같아 로컬 주소가 바뀌지 않는다.
- DB 헬스 체크에 `-h 127.0.0.1`. 첫 실행의 임시 서버는 소켓으로만 답하므로, 진짜 서버가 뜨기 전에 healthy가 되지 않는다.

로컬에서 달라지는 점은 다음과 같다. 주소와 포트의 기본값은 그대로다.

- 이미지 이름이 `plan-backend:local`, `plan-frontend:local`이 된다. 그래서 `--build` 없는 `docker compose up -d`도 첫 1회는 다시 빌드하며, 셸에 `NODE_AUTH_TOKEN`이 필요하다. 예전 이미지는 로컬에 남는다.
- 빈 볼륨 첫 실행에서 api가 진짜 서버가 뜰 때까지 기다린다.
- 로컬 `.env`에 `WEB_BIND`, `WEB_PORT`가 있으면 따른다.

`docs/project-setup.md`의 compose 설명과 예시도 맞췄다.

중앙 템플릿과 대조했다. 이미지와 포트는 중앙 `scaffold/app/compose.yaml`, `docs/runbooks/deploy.md`와 같다. 헬스 체크의 `-h 127.0.0.1`만 다르며, 의도한 차이다. 중앙에 넣는 일은 [project-standards#392](https://github.com/sirloinbh/project-standards/issues/392)로 등록했다. `deploy/backup.sh`의 복원 확인에 있는 같은 경합도 중앙 관리 파일이라 그 카드에 넣었다.

## 검증

- 로컬: `docker compose config`로 확인했다(Docker 데몬이 필요 없다). 기본값으로는 `plan-backend:local`, `plan-frontend:local`, 포트 `127.0.0.1:8107`이고, `IMAGE_TAG=abc123 WEB_BIND=0.0.0.0 WEB_PORT=9000`을 주면 `plan-backend:abc123`, `plan-frontend:abc123`, `0.0.0.0:9000`이다.
- 로컬: `env -u TEST_DATABASE_URL npm run check` 통과. 백엔드 111개 중 93 pass / 0 fail / 18 skip(DB 테스트), 프론트엔드 255개 중 253 pass / 0 fail / 2 skip, `test:skills` 4개 pass. `npm run standards:check` 통과.
- **실제 `docker compose up`과 실제 서버의 되돌리기는 확인하지 못했다.** 이 PC는 Docker 데몬이 꺼져 있고 배포가 연결되어 있지 않다. 그래서 이 PR은 이슈를 닫지 않는다. "로컬 `docker compose up`이 전처럼 동작한다"를 확인하면 이슈를 닫는다.

## 한계·후속

- 위의 `docker compose up` 확인이 남았다. 그때 첫 초기화 소요 시간도 본다. 헬스 체크 여유는 약 75초다.

## 자동 코드 리뷰

- 1차: `compose.yaml`에는 결함이 없었다. 낮음 3건을 반영했다(영향 범위 기록, 중앙 템플릿 대조 결과, `docs/project-setup.md`의 예시). 기존 버그 1건은 중앙 카드로 등록했다.

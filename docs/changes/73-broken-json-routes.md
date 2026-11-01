# #73 깨진 JSON 본문이 500으로 응답되는 문제 고치기

- 이슈: [#73](https://github.com/sirloinbh/plan-routine/issues/73)
- 브랜치: `test/73-broken-json-routes`
- 일자: 2026-11-01 (Asia/Seoul)

## 목적

깨진 JSON과 JSON 원시값 본문이 500이 되는 문제다. 동작은 [#47](47-request-body-errors.md)에서 이미 고쳐졌다. 이슈의 완료 기준인 "경로마다 이 입력을 확인하는 테스트"만 남아 있었다.

## 변경

`backend/test/request-input.test.ts`: 본문을 읽는 7개 경로와 이슈의 5개 본문(`{`, `null`, `1`, `"x"`, `true`) 조합 35개가 모두 한국어 400이고 DB에 닿지 않음을 확인한다. 앱 코드는 바꾸지 않았다.

이슈는 health-log의 문구 `요청 본문의 JSON 형식이 올바르지 않습니다`를 예로 들지만, 완료 기준은 "400과 한국어 메시지"이므로 #47에서 정한 문구를 유지한다.

## 검증

- 로컬: `env -u TEST_DATABASE_URL npm run check` 통과. 백엔드 164개 중 145 pass / 0 fail / 19 skip(DB 테스트), 프론트엔드 306개 중 304 pass / 0 fail / 2 skip, `test:skills` 4개 pass.

## 한계·후속

없음.

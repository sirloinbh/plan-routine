# 계획·실천·루틴·피드백 PostgreSQL

PostgreSQL 17. 마이그레이션 원본은 `migrations/NNN_<설명>.sql` 한 곳뿐이다. 빈 Docker 볼륨에서는 최초 실행 시 모든 파일이 이름순으로 자동 적용되고, CI도 모든 파일을 순서대로 적용한다.

기존 DB에는 실행기로 적용한다. 규칙의 원본은 `sirloinbh/project-standards`의 `docs/conventions/database.md`다.

```powershell
npm run db:migrate             # 대기 중인 파일 적용
npm run db:migrate -- --status # 적용됨·대기 목록만 확인
```

실행기는 `schema_migrations` 표에 적용한 파일과 체크섬을 기록한다. 이미 적용한 파일은 다시 실행하지 않으며, 내용이 바뀌었으면 멈춘다. 그래서 **적용한 파일은 고치지 않고** 새 번호의 파일로 바꾼다. 기록 표가 없는 DB에서는 처음 한 번 001부터 모두 다시 적용한다. `deploy/remote-deploy.sh`는 배포 때 `dist/migrate.js`로 같은 실행기를 돌린다. 파일 안에 psql 메타 명령, `BEGIN`·`COMMIT`, `CREATE INDEX CONCURRENTLY`를 쓰지 않는다.

실행기를 쓸 수 없을 때만 컨테이너에 마운트된 파일로 직접 적용한다. 이 경우 기록이 남지 않는다.

```powershell
docker compose exec -T db psql -U plan -d plan -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/NNN_<설명>.sql
```

`Get-Content … | docker compose exec … psql`처럼 PowerShell 파이프로 넘기지 않는다. Windows PowerShell 5.1은 외부 프로그램으로 ASCII를 보내 한글이 `?`로 깨진다.

규칙: 모든 마이그레이션은 재실행해도 안전하게 쓴다. 병렬 브랜치는 착수 시 번호를 예약한다. 기존 데이터의 의미를 보존하고, 확인하지 못한 값은 NULL로 둔다. SQL의 한글 리터럴은 가능하면 `U&'\\XXXX'` 이스케이프를 쓴다.

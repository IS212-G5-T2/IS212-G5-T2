# Local Database Assets

This directory contains database initialization files shared by local development tooling.

## PostgreSQL

`postgresql/` contains a buildable PostgreSQL image for local development. Its `Dockerfile` copies `postgresql/init/` into `/docker-entrypoint-initdb.d`, so the same image can be used by Docker Compose or run on its own.

Build the database image from the repository root:

```sh
docker build -t spm-postgresql development/database/postgresql
```

Run only the local database:

```sh
docker run --name spm-postgresql -p 5432:5432 spm-postgresql
```

The image includes local-only defaults for `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`. Override them with `-e` flags only when you intentionally need different local credentials.

PostgreSQL only runs these files when the `postgres-data` volume is first created. If the database already exists, update it manually or explicitly reset local data with:

```sh
docker compose -f development/local-dev/compose.yaml down -v
```

Use reset only when local data can be discarded.

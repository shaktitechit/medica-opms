# Running Medica with Docker

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)

## Production-style stack

1. Create env file (required for a real `JWT_SECRET`):

   ```bash
   cp .env.docker.example .env.docker
   ```

   Edit `.env.docker` and set `JWT_SECRET` to a long random string.

2. Build and start:

   ```bash
   docker compose up --build
   ```

3. Open:

   | Service   | URL                      |
   |-----------|--------------------------|
   | Frontend  | http://localhost:3000    |
   | Backend   | http://localhost:5000    |
   | Health    | http://localhost:5000/health |

On first boot the API connects to MongoDB, runs seed bootstrap, and starts workers (Redis).

Default seeded password (if `SEED_PASSWORD` unset in `.env.docker`): `ChangeMe123!` — see backend seed scripts.

## Development (hot reload)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Source folders are mounted read-only; Node/Next watch for changes.

## Useful commands

```bash
# Detached
docker compose up -d --build

# Logs
docker compose logs -f backend

# Stop and remove containers (keeps DB volumes)
docker compose down

# Stop and wipe Mongo/Redis data
docker compose down -v

# Seed users manually (optional)
docker compose exec backend npm run seed:users
```

## Environment notes

- **MongoDB** in Compose: `mongodb://mongo:27017/medica` (data in volume `mongo_data`).
- **Redis** in Compose: `redis://redis:6379`.
- **`NEXT_PUBLIC_API_ORIGIN`** must be the URL your **browser** uses to reach the API. For local Compose that is `http://localhost:5000`. Rebuild the frontend image if you change it.
- **File uploads** need `FILE_MANAGEMENT_API_URL` and `FILE_MANAGEMENT_API_KEY` in `.env.docker` if you use the external file service.
- To use **Atlas** instead of the bundled Mongo service, comment out or remove the `mongo` service, set `MONGO_URI` in `.env.docker`, and remove `MONGO_URI` / `MONGODB_URI` overrides under `backend.environment` in `docker-compose.yml`.

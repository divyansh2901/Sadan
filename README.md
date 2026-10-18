# HostelPro

HostelPro is a MySQL-backed hostel-management system with separate admin/staff and student React portals.

## Active architecture

- **Backend:** `backend/src/server.ts` starts `backend/src/app.ts`.
- **Routes:** `backend/src/modules/` is the only active API implementation.
- **Database:** MySQL through Prisma in `backend/prisma/`.
- **Admin frontend:** `backend/frontend/` on Vite port `5173`.
- **Student frontend:** `student-panel/` on Vite port `5174`.

The old `backend/src/routes/` implementation was removed so insecure legacy endpoints cannot be started accidentally.

## Setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Set a real MySQL `DATABASE_URL` and a unique `JWT_SECRET` of at least 32 characters. The server refuses the old placeholder secret.
3. Start MySQL and create the database named in `DATABASE_URL`.
4. From `backend/`, apply existing and new migrations without resetting data:

   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

5. Install and seed development data only when appropriate:

   ```bash
   npm ci
   npm run seed
   ```

   The seed command reuses records by email, room number, event title, equipment name, and payment identity. It does not reset the database.

6. Start the backend:

   ```bash
   npm run dev
   ```

7. In separate terminals start the portals:

   ```bash
   cd backend/frontend && npm ci && npm run dev
   cd student-panel && npm ci && npm run dev
   ```

The Vite proxies send `/api` requests to `http://localhost:5000`. For another environment, set `VITE_API_URL` during the frontend build and configure `CORS_ORIGINS` on the backend.

## Checks

Run from `backend/`:

```bash
npm run build
npm test
npx prisma validate
```

Run from each frontend directory:

```bash
npm run lint
npm run build
```

The API test suite runs database-independent authentication and authorization checks by default. Database-backed isolation, room-capacity, payment, cleaning, and inventory tests require an explicitly supplied isolated `TEST_DATABASE_URL`; they are intentionally skipped when that variable is absent rather than using the development database.

## Security notes

- Public registration always creates a `STUDENT`; callers cannot self-register as staff or administrators.
- Administrative writes require role authorization on the backend.
- Student data is served through `/api/students/me` and ownership is derived from the verified JWT.
- API responses use explicit safe user projections and never return `passwordHash`.
- Password reset tokens are hashed, expire after one hour, and are single-use.
- Do not put production credentials in seed data, frontend code, or committed environment files.

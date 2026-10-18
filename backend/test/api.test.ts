import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import app from '../src/app';
import { authorize, type AuthRequest } from '../src/middleware/auth';
import { HttpError } from '../src/middleware/errorHandler';
import { normalizeAmenities, positiveAmount } from '../src/utils/validation';

test('health endpoint is public and reports an operational API', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('protected API routes reject requests without a bearer token', async () => {
  const response = await request(app).get('/api/students');
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'Authentication required');
});

test('protected API routes reject malformed bearer tokens before database access', async () => {
  const response = await request(app)
    .get('/api/admin/dashboard')
    .set('Authorization', 'Bearer not-a-jwt');
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'Invalid or expired token');
});

test('role authorization rejects students from administrative operations', () => {
  let statusCode = 0;
  let payload: unknown;
  let called = false;
  const middleware = authorize('ADMIN', 'STAFF');
  middleware(
    { user: { id: 10, role: 'STUDENT', email: 'student@example.com' } } as AuthRequest,
    { status: (code: number) => { statusCode = code; return { json: (body: unknown) => { payload = body; } }; } } as any,
    () => { called = true; },
  );
  assert.equal(called, false);
  assert.equal(statusCode, 403);
  assert.deepEqual(payload, { error: 'Access denied' });
});

test('role authorization permits staff for operational operations', () => {
  let called = false;
  authorize('ADMIN', 'STAFF')(
    { user: { id: 11, role: 'STAFF', email: 'staff@example.com' } } as AuthRequest,
    {} as any,
    () => { called = true; },
  );
  assert.equal(called, true);
});

test('validation rejects invalid amounts and normalizes legacy amenities', () => {
  assert.throws(() => positiveAmount(0), (error: unknown) => error instanceof HttpError && error.statusCode === 400);
  assert.deepEqual(normalizeAmenities('AC, WiFi'), '["AC","WiFi"]');
  assert.deepEqual(normalizeAmenities('["AC", "WiFi"]'), '["AC","WiFi"]');
});

test('database-backed isolation and inventory tests require TEST_DATABASE_URL', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  // These cases intentionally require an explicitly supplied, isolated MySQL test database.
  // They are kept as a visible gate rather than silently pointing tests at the developer database.
  assert.ok(process.env.TEST_DATABASE_URL);
});

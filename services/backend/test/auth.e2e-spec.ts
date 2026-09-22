/*
 * Exercises the PostgreSQL-backed local login flow against the same seeded
 * database image used by CI.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const { Pool } = pg;
const LOCAL_EMAIL = 'attendee1@connectsphere.test';
const LOCAL_PASSWORD = 'P@55w0rd';
const SESSION_COOKIE_NAME = 'connectsphere_session';

describe('Local PostgreSQL authentication (e2e)', () => {
  let app: INestApplication;
  let pool: pg.Pool;

  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  // A valid seeded account receives a server-side session and only an HTTP-only browser cookie.
  it('logs in a seeded attendee and resolves the persisted session', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: LOCAL_EMAIL, password: LOCAL_PASSWORD })
      .expect(201);

    expect(login.body).toMatchObject({
      email: LOCAL_EMAIL,
      name: 'Attendee 1',
      roles: ['ATTENDEE'],
    });
    expect(login.body).not.toHaveProperty('token');
    const cookie = sessionCookie(login.headers['set-cookie']);
    expect(cookie.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie.split(';', 1)[0])
      .expect(200)
      .expect(login.body);
  });

  // Email normalization at the API boundary must still authenticate the seeded PostgreSQL account.
  it('accepts a trimmed, case-insensitive seeded email address', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: `  ${LOCAL_EMAIL.toUpperCase()}  `,
        password: LOCAL_PASSWORD,
      })
      .expect(201);

    expect(response.body.email).toBe(LOCAL_EMAIL);
  });

  // Malformed, missing, and blank credentials are rejected before authentication can issue a session.
  it.each([
    ['an absent request body', undefined],
    ['a non-string email', { email: 42, password: LOCAL_PASSWORD }],
    ['a blank email', { email: '   ', password: LOCAL_PASSWORD }],
    ['a non-string password', { email: LOCAL_EMAIL, password: 42 }],
    ['a blank password', { email: LOCAL_EMAIL, password: '' }],
  ])('rejects %s without setting a session cookie', async (_caseName, body) => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(body)
      .expect(400);

    expect(response.body.message).toBe('Email and password are required');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  // Unknown accounts and incorrect passwords intentionally receive the same response to prevent enumeration.
  it.each([
    [
      'an incorrect password',
      { email: LOCAL_EMAIL, password: 'wrong-password' },
    ],
    [
      'an unknown email',
      { email: 'unknown@connectsphere.test', password: LOCAL_PASSWORD },
    ],
  ])('rejects %s without setting a session cookie', async (_caseName, body) => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(body)
      .expect(401);

    expect(response.body.message).toBe('Invalid email or password');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  // The protected identity endpoint requires the configured cookie, not merely any cookie header.
  it.each([
    ['no cookie', undefined],
    ['an unrelated cookie', 'theme=dark'],
    ['an empty session cookie', `${SESSION_COOKIE_NAME}=`],
    [
      'an unrecognised session token',
      `${SESSION_COOKIE_NAME}=not-a-real-token`,
    ],
  ])('rejects /api/auth/me with %s', async (_caseName, cookie) => {
    const response = request(app.getHttpServer()).get('/api/auth/me');
    if (cookie) response.set('Cookie', cookie);

    await response.expect(401);
  });

  // Logout revokes the database row, clears the cookie, and leaves a copied pre-logout cookie unusable.
  it('revokes a persisted session on logout', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: LOCAL_EMAIL, password: LOCAL_PASSWORD })
      .expect(201);
    const cookie = sessionCookie(login.headers['set-cookie']).split(';', 1)[0];

    const logout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    const clearedCookie = sessionCookie(logout.headers['set-cookie']);
    expect(clearedCookie.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);
    expect(clearedCookie).toContain('HttpOnly');
    expect(clearedCookie).toContain('SameSite=Lax');

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });

  // Logout is idempotent: a missing cookie still receives a correctly cleared browser cookie.
  it('clears the session cookie when logging out without a session', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .expect(204);

    expect(
      sessionCookie(response.headers['set-cookie']).startsWith(
        `${SESSION_COOKIE_NAME}=`,
      ),
    ).toBe(true);
  });

  // Expired session rows are not accepted even before cleanup removes them.
  it('rejects an expired local session', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: LOCAL_EMAIL, password: LOCAL_PASSWORD })
      .expect(201);
    const cookie = sessionCookie(login.headers['set-cookie']);
    const rawToken = cookie.split(';', 1)[0].split('=', 2)[1];

    await pool.query(
      `UPDATE auth_sessions
       SET created_at = now() - interval '9 hours',
           expires_at = now() - interval '1 second'
       WHERE token_hash = encode(digest($1, 'sha256'), 'hex')`,
      [rawToken],
    );

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie.split(';', 1)[0])
      .expect(401);
  });

  // Disabling an account invalidates every otherwise-live server-side session for that account.
  it('rejects a live session after its account is disabled', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: LOCAL_EMAIL, password: LOCAL_PASSWORD })
      .expect(201);
    const cookie = sessionCookie(login.headers['set-cookie']).split(';', 1)[0];

    await pool.query('UPDATE users SET is_active = false WHERE email = $1', [
      LOCAL_EMAIL,
    ]);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });

  afterEach(async () => {
    await pool?.query('UPDATE users SET is_active = true WHERE email = $1', [
      LOCAL_EMAIL,
    ]);
    await pool?.query(
      `DELETE FROM auth_sessions
       WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [LOCAL_EMAIL],
    );
    await pool?.end();
    await app?.close();
  });
});

function sessionCookie(setCookie: string | string[] | undefined): string {
  const cookies = typeof setCookie === 'string' ? [setCookie] : setCookie;
  const cookie = cookies?.find((value) =>
    value.startsWith(`${SESSION_COOKIE_NAME}=`),
  );
  if (!cookie)
    throw new Error('Expected a local authentication session cookie');
  return cookie;
}

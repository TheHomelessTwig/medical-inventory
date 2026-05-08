import { describe, it, expect, beforeEach } from 'vitest';
import { api, getToken, clearTransactionalData } from './helpers';

describe('Authentication', () => {
  beforeEach(() => clearTransactionalData());

  // ── Login ────────────────────────────────────────────────────────────────
  describe('POST /api/auth/login', () => {
    it('returns tokens and user on valid credentials', async () => {
      const res = await api.post('/api/auth/login').send({
        email: 'admin@test.local',
        password: 'Admin123!',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.email).toBe('admin@test.local');
      expect(res.body.user.role).toBe('admin');
      expect(res.body.user).not.toHaveProperty('password_hash');
    });

    it('returns 401 for wrong password', async () => {
      const res = await api.post('/api/auth/login').send({
        email: 'admin@test.local',
        password: 'wrongpassword',
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid/i);
    });

    it('returns 401 for unknown email', async () => {
      const res = await api.post('/api/auth/login').send({
        email: 'nobody@test.local',
        password: 'Admin123!',
      });
      expect(res.status).toBe(401);
    });

    it('returns 400 for malformed body', async () => {
      const res = await api.post('/api/auth/login').send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('locks account after 5 failed attempts', async () => {
      const creds = { email: 'doctor@test.local', password: 'wrong' };

      for (let i = 0; i < 5; i++) {
        await api.post('/api/auth/login').send(creds);
      }

      const res = await api.post('/api/auth/login').send(creds);
      expect(res.status).toBe(423); // Locked
      expect(res.body.error).toMatch(/locked/i);
    });
  });

  // ── /me ──────────────────────────────────────────────────────────────────
  describe('GET /api/auth/me', () => {
    it('returns current user with valid token', async () => {
      const token = await getToken();
      const res = await api.get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('admin@test.local');
    });

    it('returns 401 with no token', async () => {
      const res = await api.get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 401 with tampered token', async () => {
      const res = await api
        .get('/api/auth/me')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.fake.signature');
      expect(res.status).toBe(401);
    });
  });

  // ── Refresh ───────────────────────────────────────────────────────────────
  describe('POST /api/auth/refresh', () => {
    it('issues a new access token from a valid refresh token', async () => {
      const loginRes = await api.post('/api/auth/login').send({
        email: 'nurse@test.local',
        password: 'Nurse123!',
      });
      const { refreshToken } = loginRes.body;

      const refreshRes = await api.post('/api/auth/refresh').send({ refreshToken });
      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body).toHaveProperty('accessToken');
      expect(refreshRes.body).toHaveProperty('refreshToken'); // rotation

      // Verify the new access token is actually valid (the meaningful assertion —
      // checking string inequality is fragile when both tokens are issued within
      // the same second and share the same iat timestamp)
      const meRes = await api
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${refreshRes.body.accessToken}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.email).toBe('nurse@test.local');
    });

    it('rejects a fabricated refresh token', async () => {
      const res = await api
        .post('/api/auth/refresh')
        .send({ refreshToken: 'not.a.real.token' });
      expect(res.status).toBe(401);
    });
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  describe('POST /api/auth/logout', () => {
    it('invalidates the refresh token on logout', async () => {
      const loginRes = await api.post('/api/auth/login').send({
        email: 'admin@test.local',
        password: 'Admin123!',
      });
      const { accessToken, refreshToken } = loginRes.body;

      await api
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

      // Using the same refresh token again should fail
      const refreshRes = await api.post('/api/auth/refresh').send({ refreshToken });
      expect(refreshRes.status).toBe(401);
    });
  });
});

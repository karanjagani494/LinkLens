import { describe, expect, it } from 'vitest';
import { buildApi } from '../server/app';

describe('API foundation', () => {
  it('reports liveness without pretending scan features are ready', async () => {
    const app = buildApi();
    try {
      const response = await app.inject({ method: 'GET', url: '/api/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'ok', stage: 'foundation', capabilities: { scans: false, redirects: false, reputation: false, ai: false } });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    } finally { await app.close(); }
  });
  it('allows the configured frontend and does not grant CORS to other origins', async () => {
    const app = buildApi({ frontendOrigins: ['http://localhost:3000'] });
    try {
      const allowed = await app.inject({ method: 'OPTIONS', url: '/api/scans', headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
      expect(allowed.statusCode).toBe(204);
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(allowed.headers['access-control-allow-headers']).toMatch(/Authorization/i);
      const denied = await app.inject({ method: 'GET', url: '/api/health', headers: { origin: 'https://other.example' } });
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    } finally { await app.close(); }
  });
  it('leaves scans disabled and sanitises errors', async () => {
    const app = buildApi();
    try {
      const response = await app.inject({ method: 'POST', url: '/api/scans', payload: { url: 'https://example.test/SECRET?token=SENTINEL' } });
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('NOT_READY');
      expect(response.body).not.toMatch(/SECRET|SENTINEL/);
      const missing = await app.inject({ method: 'GET', url: '/unknown?secret=SENTINEL' });
      expect(missing.statusCode).toBe(404);
      expect(missing.body).not.toContain('SENTINEL');
      const oversized = await app.inject({ method: 'POST', url: '/api/scans', payload: { url: 'x'.repeat(9000) } });
      expect(oversized.statusCode).toBe(413);
      expect(oversized.json().code).toBe('BODY_TOO_LARGE');
    } finally { await app.close(); }
  });
});

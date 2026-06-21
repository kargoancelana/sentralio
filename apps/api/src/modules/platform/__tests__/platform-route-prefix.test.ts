import { test, expect, describe } from 'bun:test';
import { platformAuthPublicRoutes } from '../platform-auth.route';

describe('platform route prefix regression test', () => {
  test('POST /platform/auth/login does not return 404', async () => {
    const res = await platformAuthPublicRoutes.handle(
      new Request('http://localhost/platform/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(res.status).not.toBe(404);
  });

  test('POST /api/platform/auth/login returns 404', async () => {
    const res = await platformAuthPublicRoutes.handle(
      new Request('http://localhost/api/platform/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(404);
  });
});

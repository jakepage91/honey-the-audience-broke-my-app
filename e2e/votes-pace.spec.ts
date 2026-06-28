import { test, expect } from '@playwright/test';

const VALID_CHOICES = ['print', 'stare', 'ai', 'revert', 'restart'];

test.describe('GET /votes/pace', () => {
  test('returns 200 with correct shape', async ({ request }) => {
    const res = await request.get('/votes/pace');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('recent_30s');
    expect(body).toHaveProperty('all_time');

    for (const choice of VALID_CHOICES) {
      expect(typeof body.recent_30s[choice]).toBe('number');
      expect(typeof body.all_time[choice]).toBe('number');
      expect(body.recent_30s[choice]).toBeGreaterThanOrEqual(0);
      expect(body.all_time[choice]).toBeGreaterThanOrEqual(0);
    }
  });

  test('recent_30s count increases after casting a vote', async ({ request }) => {
    const before = await (await request.get('/votes/pace')).json();

    const voteRes = await request.post('/vote', { data: { choice: 'ai' } });
    expect(voteRes.status()).toBe(200);

    // Poll for the new vote to appear in recent_30s (up to 10 × 1s)
    let after: Record<string, Record<string, number>> | null = null;
    for (let i = 0; i < 10; i++) {
      const r = await request.get('/votes/pace');
      const body = await r.json();
      if (body.recent_30s['ai'] > before.recent_30s['ai']) {
        after = body;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    expect(after).not.toBeNull();
    expect(after!.all_time['ai']).toBeGreaterThan(before.all_time['ai']);
    expect(after!.recent_30s['ai']).toBeGreaterThan(before.recent_30s['ai']);
  });

  test('all_time >= recent_30s for every choice', async ({ request }) => {
    const body = await (await request.get('/votes/pace')).json();
    for (const choice of VALID_CHOICES) {
      expect(body.all_time[choice]).toBeGreaterThanOrEqual(body.recent_30s[choice]);
    }
  });
});

test.describe('regression: existing endpoints', () => {
  test('GET /votes returns all choices', async ({ request }) => {
    const res = await request.get('/votes');
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const choice of VALID_CHOICES) {
      expect(body).toHaveProperty(choice);
    }
  });

  test('POST /vote with valid choice returns ok', async ({ request }) => {
    const res = await request.post('/vote', { data: { choice: 'stare' } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('GET /health returns healthy', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('healthy');
  });

  test('GET /ready returns ready', async ({ request }) => {
    const res = await request.get('/ready');
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('ready');
  });
});

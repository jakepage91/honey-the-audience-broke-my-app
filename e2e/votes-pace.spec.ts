import { test, expect } from '@playwright/test';

const VALID_CHOICES = ['print', 'stare', 'ai', 'revert', 'restart'];

test.describe('GET /votes/pace', () => {
  test('returns recent_30s and all_time with all valid choices', async ({ request }) => {
    const resp = await request.get('/votes/pace');
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body).toHaveProperty('recent_30s');
    expect(body).toHaveProperty('all_time');

    for (const choice of VALID_CHOICES) {
      expect(body.recent_30s).toHaveProperty(choice);
      expect(body.all_time).toHaveProperty(choice);
      expect(typeof body.recent_30s[choice]).toBe('number');
      expect(typeof body.all_time[choice]).toBe('number');
    }
  });

  test('a freshly-cast vote appears in recent_30s and all_time', async ({ request }) => {
    const choice = 'ai';

    const before = await (await request.get('/votes/pace')).json();
    const beforeRecent = before.recent_30s[choice] as number;
    const beforeTotal = before.all_time[choice] as number;

    const voteResp = await request.post('/vote', { data: { choice } });
    expect(voteResp.status()).toBe(200);

    // Poll until the new vote is reflected (up to 15 × 1s = 15s)
    let afterRecent = beforeRecent;
    let afterTotal = beforeTotal;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const pace = await (await request.get('/votes/pace')).json();
      afterRecent = pace.recent_30s[choice] as number;
      afterTotal = pace.all_time[choice] as number;
      if (afterRecent > beforeRecent && afterTotal > beforeTotal) break;
    }

    expect(afterRecent).toBeGreaterThan(beforeRecent);
    expect(afterTotal).toBeGreaterThan(beforeTotal);
  });

  test('all_time >= recent_30s for every choice', async ({ request }) => {
    const resp = await request.get('/votes/pace');
    const body = await resp.json();
    for (const choice of VALID_CHOICES) {
      expect(body.all_time[choice]).toBeGreaterThanOrEqual(body.recent_30s[choice]);
    }
  });

  test('regression: /votes still works', async ({ request }) => {
    const resp = await request.get('/votes');
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    for (const choice of VALID_CHOICES) {
      expect(body).toHaveProperty(choice);
    }
  });

  test('regression: /health still works', async ({ request }) => {
    const resp = await request.get('/health');
    expect(resp.status()).toBe(200);
  });

  test('regression: /ready still works', async ({ request }) => {
    const resp = await request.get('/ready');
    expect(resp.status()).toBe(200);
  });
});

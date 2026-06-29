import { test, expect } from '@playwright/test';

const VALID_CHOICES = ['print', 'stare', 'ai', 'revert', 'restart'];

test.describe('GET /votes/pace', () => {
  test('returns last_30s and all_time counts for all options', async ({ request }) => {
    const res = await request.get('/votes/pace');
    expect(res.status()).toBe(200);

    const body = await res.json();

    for (const choice of VALID_CHOICES) {
      expect(body).toHaveProperty(choice);
      const entry = body[choice];
      expect(typeof entry.last_30s).toBe('number');
      expect(typeof entry.all_time).toBe('number');
      expect(entry.last_30s).toBeGreaterThanOrEqual(0);
      expect(entry.all_time).toBeGreaterThanOrEqual(0);
      expect(entry.all_time).toBeGreaterThanOrEqual(entry.last_30s);
      expect(typeof entry.label).toBe('string');
    }
  });

  test('new vote appears in last_30s', async ({ request }) => {
    const before = await (await request.get('/votes/pace')).json();

    await request.post('/vote', { data: { choice: 'ai' } });

    // Poll for the new vote to appear in last_30s (up to 15s)
    let after: Record<string, { last_30s: number; all_time: number; label: string }> | null = null;
    for (let i = 0; i < 15; i++) {
      const res = await request.get('/votes/pace');
      const body = await res.json();
      if (body.ai.last_30s > (before.ai?.last_30s ?? 0)) {
        after = body;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    expect(after).not.toBeNull();
    expect(after!.ai.last_30s).toBeGreaterThan(before.ai?.last_30s ?? 0);
    expect(after!.ai.all_time).toBeGreaterThanOrEqual(after!.ai.last_30s);
  });

  test('existing routes still work (regression)', async ({ request }) => {
    const health = await request.get('/health');
    expect(health.status()).toBe(200);

    const ready = await request.get('/ready');
    expect(ready.status()).toBe(200);

    const votes = await request.get('/votes');
    expect(votes.status()).toBe(200);
    const votesBody = await votes.json();
    for (const choice of VALID_CHOICES) {
      expect(votesBody).toHaveProperty(choice);
      expect(typeof votesBody[choice].count).toBe('number');
    }
  });
});

import { test, expect } from '@playwright/test';

const VALID_CHOICES = ['print', 'stare', 'ai', 'revert', 'restart'];

test('GET /votes/pace returns correct shape', async ({ request }) => {
  const res = await request.get('/votes/pace');
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body).toHaveProperty('last_30s');
  expect(body).toHaveProperty('all_time');

  for (const choice of VALID_CHOICES) {
    expect(body.last_30s).toHaveProperty(choice);
    expect(body.all_time).toHaveProperty(choice);
    expect(typeof body.last_30s[choice].count).toBe('number');
    expect(typeof body.all_time[choice].count).toBe('number');
    expect(typeof body.last_30s[choice].label).toBe('string');
  }
});

test('all_time >= last_30s for every choice', async ({ request }) => {
  const res = await request.get('/votes/pace');
  expect(res.status()).toBe(200);
  const pace = await res.json();

  // ponytail: Redis and Postgres can diverge after a reset, so parity with
  // /votes is not a valid invariant. Only test what /votes/pace guarantees.
  for (const choice of VALID_CHOICES) {
    expect(pace.all_time[choice].count).toBeGreaterThanOrEqual(pace.last_30s[choice].count);
  }
});

test('a fresh vote appears in last_30s', async ({ request }) => {
  test.setTimeout(60_000);

  // Record counts before the vote
  const before = await (await request.get('/votes/pace')).json();

  // Submit a fresh vote
  const voteRes = await request.post('/vote', { data: { choice: 'ai' } });
  expect(voteRes.status()).toBe(200);

  // Poll until last_30s reflects the new vote (up to 15 × 1s)
  let found = false;
  for (let i = 0; i < 15; i++) {
    const pace = await (await request.get('/votes/pace')).json();
    if (pace.last_30s['ai'].count > before.last_30s['ai'].count) {
      found = true;
      // all_time must also have incremented
      expect(pace.all_time['ai'].count).toBe(before.all_time['ai'].count + 1);
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  expect(found).toBe(true);
});

test('regression: /votes, /health, /ready still respond', async ({ request }) => {
  const [votes, health, ready] = await Promise.all([
    request.get('/votes'),
    request.get('/health'),
    request.get('/ready'),
  ]);
  expect(votes.status()).toBe(200);
  expect(health.status()).toBe(200);
  expect(ready.status()).toBe(200);
});

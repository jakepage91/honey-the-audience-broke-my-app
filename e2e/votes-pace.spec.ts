import { test, expect, APIRequestContext } from '@playwright/test';

// Runs against the real cluster ingress via mirrord steal mode (see
// playwright.config.ts baseURL + baggage header). No mocks: /votes/pace reads
// the live Postgres `votes` table. Assertions are delta-based so they tolerate
// pre-existing rows and concurrent audience traffic on the shared cluster DB.

const VALID_CHOICES = ['print', 'stare', 'ai', 'revert', 'restart'];

async function getPace(request: APIRequestContext) {
  const res = await request.get('/votes/pace');
  expect(res.status()).toBe(200);
  return res.json();
}

test('GET /votes/pace returns recent + all-time counts for every option', async ({ request }) => {
  const body = await getPace(request);

  expect(body.window_seconds).toBe(30);
  expect(body.options).toBeTruthy();

  for (const choice of VALID_CHOICES) {
    const opt = body.options[choice];
    expect(opt, `missing option ${choice}`).toBeTruthy();
    expect(typeof opt.label).toBe('string');
    expect(Number.isInteger(opt.recent)).toBe(true);
    expect(Number.isInteger(opt.total)).toBe(true);
    expect(opt.recent).toBeGreaterThanOrEqual(0);
    // recent is a subset of all-time, by construction (single SQL aggregate).
    expect(opt.total).toBeGreaterThanOrEqual(opt.recent);
  }
});

test('new votes raise both recent and total for the voted choice', async ({ request }) => {
  const choice = 'ai';
  const N = 3;

  const before = await getPace(request);
  const beforeOpt = before.options[choice];

  for (let i = 0; i < N; i++) {
    const res = await request.post('/vote', { data: { choice } });
    expect(res.status()).toBe(200);
  }

  const after = await getPace(request);
  const afterOpt = after.options[choice];

  // Deltas (>=) rather than equality: the shared cluster DB may receive other
  // votes concurrently. Our N votes fall inside the 30s window.
  expect(afterOpt.recent).toBeGreaterThanOrEqual(beforeOpt.recent + N);
  expect(afterOpt.total).toBeGreaterThanOrEqual(beforeOpt.total + N);
});

test('regression: /votes, /vote and /health still work', async ({ request }) => {
  const health = await request.get('/health');
  expect(health.status()).toBe(200);
  expect((await health.json()).status).toBe('healthy');

  const votes = await request.get('/votes');
  expect(votes.status()).toBe(200);
  const votesBody = await votes.json();
  for (const choice of VALID_CHOICES) {
    expect(votesBody[choice]).toBeTruthy();
    expect(typeof votesBody[choice].count).toBe('number');
  }

  const vote = await request.post('/vote', { data: { choice: 'print' } });
  expect(vote.status()).toBe(200);
  expect((await vote.json())).toMatchObject({ status: 'ok', choice: 'print' });
});

import { test, expect } from '@playwright/test';

const VALID_CODE = 'conf-partner-2026';
const CHOICES = ['print', 'stare', 'ai', 'revert', 'restart'];

test('valid referral code succeeds more than 10 times in a row', async ({ request }) => {
  // This is the core regression: before the fix, the 11th call raised RuntimeError → 503
  for (let i = 0; i < 15; i++) {
    const choice = CHOICES[i % CHOICES.length];
    const res = await request.post('/vote', {
      data: { choice, referral: VALID_CODE },
    });
    expect(res.status(), `attempt ${i + 1} should succeed`).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  }
});

test('invalid referral code returns 400', async ({ request }) => {
  const res = await request.post('/vote', {
    data: { choice: 'ai', referral: 'bogus-code' },
  });
  expect(res.status()).toBe(400);
});

test('vote without referral code still works', async ({ request }) => {
  const res = await request.post('/vote', { data: { choice: 'print' } });
  expect(res.status()).toBe(200);
  expect((await res.json()).status).toBe('ok');
});

test('existing endpoints unaffected', async ({ request }) => {
  const votes = await request.get('/votes');
  expect(votes.status()).toBe(200);

  const health = await request.get('/health');
  expect(health.status()).toBe(200);

  const ready = await request.get('/ready');
  expect(ready.status()).toBe(200);
});

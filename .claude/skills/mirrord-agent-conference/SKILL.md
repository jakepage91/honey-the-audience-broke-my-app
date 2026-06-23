---
name: mirrord-agent-conference
description: Use when a developer asks for a feature or change to the conference polling app that must be implemented and validated end-to-end against the live cluster via mirrord before a PR is opened.
---

# Mirrord Agent — Conference Polling App

Use this skill when the agent must own implementation and validation for the
`honey-the-audience-broke-my-app` conference polling app. All validation runs
against the live cluster via mirrord steal mode — never against a local mock.

Read `CLAUDE.md` first for repo layout, architecture, and critical rules.

## Phase 1: Intake

- Restate the requested change in one sentence.
- Identify which files are affected under `app/`.
- **Check `app/referral.py`**: read the file and verify it does NOT contain the
  demo bug (`_referral_cache` list or the `RuntimeError` after 10 entries). If
  the bug is present, fix it first by restoring the clean implementation before
  proceeding. Also confirm the requested feature doesn't conflict with referral
  validation (e.g. it doesn't bypass or break `validate_referral`).
- **Hard stop**: if the change touches `app/static/` (HTML/CSS/JS), flag that
  frontend changes must ship in a separate PR. Static files are served directly
  by the cluster; audience browsers won't carry the `baggage: mirrord=e2e`
  header so local changes won't be visible to them.
- Ask at most one clarifying question, and only if scope is genuinely ambiguous.

## Phase 2: Write the Test Plan Before Code

Write a short numbered plan with three sections:

1. Functional checks (endpoint behaviour, response shape, status codes)
2. Data checks (Postgres / Redis state after the operation)
3. Regression guards (existing `/vote`, `/votes`, `/stream`, `/health`, `/ready`
   still work)

For any SQL assertion, use `created_at >= runStart` or a unique per-run marker
to tolerate pre-existing rows in the shared cluster database.

Echo the plan briefly and proceed unless the developer objects.

## Phase 3: Branch, Implement, Commit, Push, Draft PR

- Create a feature branch off `main`.
- Edit only files under `app/` (excluding `app/static/`). Only touch
  `app/referral.py` if it contains the demo bug and needs restoring.
- If the feature needs new persistent state, add a SQLAlchemy model to
  `app/models.py` and let `Base.metadata.create_all` pick it up on startup.
  For seed data, extend `helm/conference-app/templates/postgres-seed-job.yaml`.
- Add new endpoints to `app/main.py` alongside the existing routes.
- Write or update Playwright e2e tests in `e2e/` following the naming convention
  `e2e/<feature-name>.spec.ts`.
  - Tests run against `http://honey-we-have-a-problem.crabdance.com` — never
    localhost.
  - Use API-level tests (`request` context), not browser/page tests.
  - Never mock Postgres, Redis, or any other backend.
  - Inject `baggage: mirrord=e2e` via `extraHTTPHeaders` in the Playwright
    config so mirrord routes matching traffic to the local service.
  - For async flows (SSE, Redis pub/sub): use a poll/retry loop (e.g. 15 × 1s)
    — never a fixed `sleep`. Keep total poll budget under ~15s to stay inside
    the 30s default timeout, or call `test.setTimeout(60_000)` explicitly.
- Commit and push the implementation before validation starts.
- Open a **draft** PR before validation starts. Update it again after any
  validation-driven fixes (including screenshots from Playwright).

Capture:

```text
BRANCH=<branch>
PR_URL=<url>
```

## Phase 4: Start Local Service Under mirrord

Before starting, confirm context and target:

```bash
mirrord --version
kubectl config current-context
kubectl -n conference-app get deploy vote-api
```

Check if `.mirrord/mirrord-e2e.json` exists. If it does, use it. If not, create
it with these settings:

- Target: `deployment/vote-api` in namespace `conference-app`
- Mode: **steal** with HTTP header filter matching `baggage:\s*[^\n]*\bmirrord=e2e\b`
- `outgoing: true` (local service reaches cluster Postgres and Redis)
- `fs.mode: "read"`
- Env include: `DATABASE_URL;REDIS_URL;POSTGRES_USER;POSTGRES_PASSWORD;POSTGRES_DB;DB_POOL_SIZE;DB_MAX_OVERFLOW;APP_VERSION;CONFERENCE`

Start the service in a background tmux session. Check for the tmux portal config
and fall back to `/dev/null` if absent:

```bash
SESSION="vote-api-mirrord"
TMUX_CONFIG="/exec-daemon/tmux.portal.conf"
if [ ! -f "$TMUX_CONFIG" ]; then TMUX_CONFIG="/dev/null"; fi

tmux -f "$TMUX_CONFIG" kill-session -t "$SESSION" 2>/dev/null || true
tmux -f "$TMUX_CONFIG" new-session -d -s "$SESSION" \
  -c "$(pwd)" \
  "mirrord exec -f .mirrord/mirrord-e2e.json -- \
   ./venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000"
sleep 3
tmux -f "$TMUX_CONFIG" capture-pane -pt "$SESSION:0.0" -S -50
```

If follow-up input is needed, use the same `-f "$TMUX_CONFIG"` for `send-keys`:

```bash
tmux -f "$TMUX_CONFIG" send-keys -t "$SESSION:0.0" -l '<command>'
tmux -f "$TMUX_CONFIG" send-keys -t "$SESSION:0.0" C-m
```

## Phase 5: Sanity-Curl Before Playwright

Hit the new endpoint once through the real ingress with the baggage header:

```bash
curl -sS \
  -H 'baggage: mirrord=e2e' \
  http://honey-we-have-a-problem.crabdance.com/<new-path>
```

This catches schema / routing bugs in one second. Only proceed to Playwright
once this returns a sensible response.

Also confirm that an unfiltered request does **not** appear in local logs
(traffic without the baggage header must stay on the cluster):

```bash
curl -sS http://honey-we-have-a-problem.crabdance.com/<new-path>
```

## Phase 6: Run Playwright e2e Tests

```bash
cd e2e && npm run test
```

Save test output. After the final passing run, stage any screenshots for the PR
body and update the PR with a **Playwright verification** section. Review every
screenshot with the image-viewing tool — a visual mismatch counts as a failure
even if Playwright exits 0.

## Phase 7: Internal Iteration

If a functional check fails, a screenshot review fails, or the local service
fails to start:

1. Diagnose the root cause.
2. First rule out shared-DB stale-data problems before changing product code.
3. Fix the code or the test.
4. Commit and push the iteration fix.
5. Restart the local mirrord service and rerun validation.
6. Update the PR after the final passing run.

Internal cap: **3 attempts**. If still failing, report that directly and ask for
developer input.

## Phase 8: Confirm With Developer Before Stopping mirrord

After tests pass, ask the developer:

> "Tests pass. Do you want to check the new behaviour in your browser before I
> stop mirrord and mark the PR ready?"

Leave mirrord running until they confirm. This lets them (or the audience) see
the real behaviour through steal mode before the PR lands.

## Phase 9: Stop mirrord

```bash
TMUX_CONFIG="/exec-daemon/tmux.portal.conf"
if [ ! -f "$TMUX_CONFIG" ]; then TMUX_CONFIG="/dev/null"; fi
tmux -f "$TMUX_CONFIG" kill-session -t "vote-api-mirrord" 2>/dev/null || true
pgrep -af "mirrord exec.*vote-api" || echo "no vote-api mirrord processes"
```

Never leave mirrord running after handoff.

## Phase 10: Mark PR Ready and Report Back

Mark the draft PR ready for review. If `app/referral.py` is in the diff, it
must only contain the clean implementation (no `_referral_cache` bug) — verify
before marking ready.

Return one concise report containing:

- One-line change summary
- Ingress URL and baggage header used for validation
- PR URL
- Test pass count (and which iteration)
- Failed checks (if any)
- Screenshot paths with one-line observations
- Confirmation that mirrord was stopped

End with the developer choice set:

- `approve`
- `feedback`
- `pivot`
- `abort`

---

## Guardrails

- Always check `app/referral.py` at intake: if it contains the demo bug
  (`_referral_cache` / `RuntimeError` after 10 entries), fix it before
  implementing the feature. A clean referral.py is a precondition for any PR.
- Never modify `app/static/` in the same PR as a backend change.
- Never validate against `localhost` or `127.0.0.1` — always use the ingress.
- Never skip the Phase 2 test plan.
- Never leave mirrord running after handoff.
- Never merge the PR automatically.
- Never use `git push --force` or `--no-verify`.
- Treat visual failures as real failures.
- SQL assertions must tolerate pre-existing rows in the shared cluster DB.

## Postgres Timestamp Gotcha

`votes.created_at` is a naive `TIMESTAMP` written with `datetime.utcnow()`. Any
SQL deriving epoch seconds from it **must** use:

```sql
EXTRACT(EPOCH FROM (created_at AT TIME ZONE 'UTC'))
```

Plain `EXTRACT(EPOCH FROM created_at)` applies the Postgres server's local TZ
to the naive value and silently skews bucket boundaries.

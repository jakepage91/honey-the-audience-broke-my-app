# Demo Script: Honey, the Audience Broke My App

---

## Slide 1 — Title

**"Honey, the Audience Broke My App"**
Event name block in the corner.

---

## Slide 2 — Speaker Intro

Tal introduces himself.

---

## Slide 3 — The Tension

Software engineers face the same tension regardless of whether they're using AI or not: **ship fast vs. stay reliable**.

We have tools and techniques for both sides. The people who care most about keeping that balance are SREs — but everyone in the audience has probably felt it.

Common examples of bugs that only surface in production:
- Memory leaks that only appear under real traffic
- DB connection pools that exhaust at peak load
- Race conditions you can't reproduce in a dev cluster (Heisenbugs)
- AI-generated changes that quietly break the environment

It doesn't matter how well you've tested in lower environments. Some bugs will only show up in production.

---

## Slide 4 — [Visual / Transition]

---

## Slide 5 — The Shape of the Problem

**Real traffic bugs need real traffic fixes.**

The dev cluster doesn't reproduce upper environments — different data, different scale, different dependencies. But the bugs are the same.

Over-relying on lower test environments for production reliability is the core problem.

And every fix-and-test cycle costs you: **CI time + rollout time**, for every single hypothesis you want to check.

---

## Slide 6 — What Do You Actually Know About Your System?

Ask the audience:

- How long does a hotfix take — from finding the bug to live in production? Do you know that number off the top of your head?
- How many people and approvals does it go through?
- How do you validate a fix before you ship? Can you test it against real data and real load?
- How many cycles does it take to get right? One-shotting every incident is the exception, not the rule. Most fixes take multiple iterations — and each one starts from scratch.

---

## Slide 7 — Let's Simulate It

We're going to look at a real app running in Kubernetes: a live polling app backed by Redis and Postgres. We'll put it through a realistic incident — from bug surfacing to fix validated.

---

## Slide 8 — Architecture

```
[Audience phones] → [Ingress] → [vote-api]
                                     ↓           ↓
                                  [Redis]    [Postgres]

[Prometheus] → scrapes /metrics
[Alertmanager] → fires to #sre-alerts on Slack
```

This is a small but typical microservice setup. A few components depending on each other.

Key point: if you want to test any change to the vote-api locally, you need Redis and Postgres running too. That's the constraint we're about to run into.

---

## Slide 9 — We Have v1. Let's Break It.

We're simulating the lifecycle of a real app. v1 is live in the cluster. Now let's go ahead and break it together.

---

## Slide 10 — [Transition to Demo]

**"Let's go ahead and break it."**

→ Switch to live demo.

---

## Slide 11 — QR Code (v1, no referral)

Show the app live. It's a poll: "What's your go-to debugging strategy?" Audience scans the QR and votes. Switch to the results dashboard and watch votes come in — stored in Postgres, displayed in real time.

**QR:** `http://honey-we-have-a-problem.crabdance.com/`

---

## Slide 12 — [Go check the app]

→ Switch back to the live dashboard. Let the votes roll in. We have something working.

---

## Slide 13 — v2: Adding a Referral Link

Something working is great, but now we want to make it better. We want to attribute votes to each event audience — so we add a referral link. The referral link is already running in the cluster (no deploy needed for this demo).

Give the audience the new QR:

**QR:** `http://honey-we-have-a-problem.crabdance.com/?referral=conf-partner-2026`

---

## Slide 14 — The Error

After 10 votes with the referral link, the service degrades. New referral votes start returning errors. → Switch to the dashboard and show the error live.

---

## Slide 15 — Slack Alert

→ Switch to `#sre-alerts` in Slack. The `ReferralCacheExhausted` alert has fired. We have a signal that tells us something is wrong and roughly where to look.

---

## Slide 16 — The Bug (Coming Clean)

The referral URL appends to a cache that grows without bound. In this demo it triggers after 10 votes, but unbounded caches are a real class of production bug — they just take longer to surface.

```python
_referral_cache = []  # never cleared

def validate_referral(code: str):
    _referral_cache.append(...)  # grows on every request
    if len(_referral_cache) > 10:
        raise RuntimeError("cache exhausted")
```

---

## Slide 17 — Knowing the Fix vs. Validating It

We know where the bug is. Finding it is one problem — but **knowing that your proposed fix actually works is sometimes the harder part**.

Traditionally, to validate a fix you'd have to:
1. Add logging
2. Build a new container image
3. Push it to a registry
4. Get it deployed to staging
5. Wait for the rollout
6. Run tests
7. If it fails, repeat from step 1

Ephemeral local environments don't help here — the bug only surfaces under real traffic and real data.

---

## Slide 18 — [Visual: Traditional Fix Cycle]

The cost: every iteration is **CI time + rollout time**. For an incident, that's minutes per hypothesis.

---

## Slide 19 — mirrord

With mirrord you run your local code against the real cluster — no rebuild, no redeploy. You test the fix exactly where the bug lives.

→ Walk through the architecture diagram: mirrord intercepts traffic at the cluster level and routes it to your local process, which talks to the real Redis and Postgres.

---

## Slide 20 — [Demo: Validate the Fix with mirrord]

1. Ask Claude to fix `app/referral.py` — it removes the unbounded cache.
2. Start the mirrord session via the Cursor extension (`vote-api` launch config, F5).
3. Hit the referral endpoint again — no more 503. Votes succeed.
4. The fix works because mirrord is stealing production traffic to the local process running the patched code.

→ Make clear: the cluster pod is still running the buggy version. We validated the fix without touching the cluster.

---

## Slide 21 — End of Act One

---

# Act Two: Agents in the Loop

## Slide 22 — Bridge

We've seen the human+AI workflow: a developer using an AI coding tool to propose a fix, then validating it with mirrord before opening a PR. But AI agents are just as vulnerable as humans to breaking an environment if they don't have the context of where the code will actually run. The strength of the model doesn't matter if it's working blind.

So: what if the agent could manage the mirrord session itself? Write the fix, validate it against the real cluster, and only open a PR once it knows the fix holds up against its real dependencies?

---

## Slide 23 — What Teams Are Starting to Look Like

Diagram: humans and AI entities sharing the same table as team members.

---

## Slide 24 — Audience Question

Ask directly: **do your teams look something like this?**

Open it up. Some prompts to draw responses:
- Do you have fully autonomous AI entities as team members?
- Or is it more AI-infused workflows — a human with a coding tool beside them?
- How much autonomy does your AI have today vs. six months ago?

---

## Slide 25 — A Real Customer Pattern

One scenario we've seen from a mirrord customer: autonomous agents running inside an agent pool in a shared cluster. Each agent has mirrord installed in its pod, receives a task, iterates against the shared cluster without stepping on other agents, and only opens a PR once it's satisfied the task is done.

There are multiple ways this collaboration can look. The common thread is agents that can verify their own work in context.

---

## Slide 26 — AI Writes It. But Can It Validate It?

The gap: agents running in a sandbox don't have direct access to the environment where the code will actually live. Skills, CLAUDE.md files, end-to-end tests, other validation tools — they all assume the agent can verify its own work. But without access to the real upstream dependencies, it's guessing.

---

## Slide 27 — We Found This By Dogfooding

mirrord had open source and operator components for a while, but not much in the way of frontend dashboards. In the last few months we've been building that out — and we found that agents building on top of our existing frontend moved significantly faster when they had access to the staging environment. This is a story from our own internal work.

---

## Slide 28 — The Traditional Agent Loop

Agent writes code in its own sandbox → opens a PR → CI deploys → e2e tests run → if it fails, repeat from the start.

Every iteration is a full pipeline cycle. The agent is flying blind until deployment.

---

## Slide 29 — The mirrord Loop

Agent writes the code **and** writes the e2e tests for that change → starts a local mirrord session → runs the e2e tests against the real staging endpoints via that session → if they pass, opens the PR. If not, iterates locally without touching the pipeline.

The agent only ships when it knows the fix works against real dependencies.

---

## Slide 30 — [Demo: Agent-Driven Fix with mirrord]

Go back to the repo. There's a `CLAUDE.md.draft` — rename it to `CLAUDE.md` and walk through what it contains:

1. Check if mirrord is configured; if not, install it
2. Implement the feature
3. Generate Playwright e2e tests for the change
4. Start a mirrord session and run those tests against staging
5. Iterate until tests pass
6. Only then open a PR

Run it. Let Claude implement a feature, run the e2e tests through mirrord, and open the PR automatically once they pass.

---

## Slide 31 — Takeaways

**1. Know your cycle time.**
How long does it take from hypothesis to verified fix — or from feature idea to validated against real dependencies? Count the cycles. Be honest about the number. Then ask: is there a way to make it shorter?

**2. Use staging more.**
Most teams have a staging environment but underuse it. Ask: is it blocked? Is someone else using it? Could more validation happen there earlier — before a PR, not after?

**3. Agents write better code with better context.**
Even a basic model improves significantly with the right tools. Give your agent access to a real environment so it can verify its own changes instead of guessing.

---

## Slide 32 — CTAs & Outro

[Tal to fill in]

---

# Demo Steps

## Before the talk: Reset the environment

```bash
kubectl rollout restart deployment/vote-api -n conference-app
kubectl rollout status deployment/vote-api -n conference-app --timeout=60s
```

Also reset vote counts via the **RESET SESSION** button on `/admin`.

---

## STEP 1: Show the app working

Open the voting page and results dashboard. Ask the audience to scan the **left QR** (no referral) and vote. Everything works.

QR codes:
- **Left (no referral):** `http://honey-we-have-a-problem.crabdance.com/`
- **Right (with referral):** `http://honey-we-have-a-problem.crabdance.com/?referral=conf-partner-2026`

---

## STEP 2: Trigger the bug

Ask the audience to scan the **right QR** (with referral). After 10 votes the service degrades — all subsequent referral votes return 503.

To simulate this without the audience:
```bash
for i in {1..15}; do
  curl -s -X POST http://honey-we-have-a-problem.crabdance.com/vote \
    -H "Content-Type: application/json" \
    -d '{"choice": "ai", "referral": "conf-partner-2026"}'
  echo ""
  sleep 0.5
done
```

Expected: requests 1–10 succeed, 11+ return `503 Service degraded: referral cache exhausted`.

---

## STEP 3: Show the symptom

- Pod is still healthy (health checks pass)
- Votes without referral still work fine
- Slack alert fires in `#sre-alerts`
- Classic "works in dev, breaks in prod" — you'd never hit 10 referral requests locally

---

## STEP 4: Apply the fix locally

The bug is in `app/referral.py` — an unbounded list that grows on every referral validation and never gets cleared.

**Buggy code (deployed in cluster):**
```python
_referral_cache = []

def validate_referral(code: str):
    _referral_cache.append({"code": code, "timestamp": time.time(), "validated": True})
    if len(_referral_cache) > 10:
        raise RuntimeError("Service degraded: referral cache exhausted")
    # ...
```

**Fix — remove the cache entirely:**
```python
def validate_referral(code: str):
    with engine.connect() as conn:
        result = conn.execute(
            select(ReferralPartner).where(ReferralPartner.code == code)
        )
        return result.scalar_one_or_none()
```

Edit `app/referral.py` locally with the fix applied.

---

## STEP 5: Test the fix with mirrord

Launch via Cursor/VS Code — open Run & Debug (`Cmd+Shift+D`), select `vote-api`, press F5.

Or via CLI:
```bash
mirrord exec -f mirrord.json -- .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

mirrord steals live traffic from the cluster pod to your local process. Now run the same 15-request test — all succeed.

**Key point for the audience:** your local process is receiving real production traffic, talking to the real Redis and Postgres in the cluster, with the fix applied — without a deploy.

---

## STEP 6: Wrap up

- Stop mirrord (Ctrl+C or stop the debugger)
- The cluster pod still has the buggy code — the demo is always ready for the next session
- In a real scenario, you'd ship the fix with confidence having already validated it against live traffic

---

# Quick Reference

**Reset pod (clears in-memory cache):**
```bash
kubectl rollout restart deployment/vote-api -n conference-app && \
kubectl rollout status deployment/vote-api -n conference-app --timeout=60s
```

**Trigger bug (one-liner):**
```bash
for i in {1..15}; do curl -s -X POST http://honey-we-have-a-problem.crabdance.com/vote -H "Content-Type: application/json" -d '{"choice": "ai", "referral": "conf-partner-2026"}'; echo ""; sleep 0.5; done
```

**Single test vote:**
```bash
curl -s -X POST http://honey-we-have-a-problem.crabdance.com/vote \
  -H "Content-Type: application/json" \
  -d '{"choice": "ai", "referral": "conf-partner-2026"}'
```

**Check pod status:**
```bash
kubectl get pods -n conference-app -l app=vote-api
```

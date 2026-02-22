# Demo Script: Fixing an Unbounded Cache Bug with mirrord

## The Scenario
- Audience votes via `http://honey-we-have-a-problem.freeddns.org/?referral=conf-partner-2026`
- The referral code triggers a bug: unbounded cache in `app/referral.py`
- After 10 votes with referral codes, the cache "exhausts" and all subsequent referral requests fail
- **Key point**: This bug only happens in production - locally, you'd never send enough traffic to trigger it

## The Bug (in `app/referral.py`)
```python
_referral_cache = []  # Never cleared, grows forever

def validate_referral(code: str):
    cache_entry = {
        "code": code,
        "timestamp": time.time(),
        "validated": True,
    }
    _referral_cache.append(cache_entry)  # Adds entry on EVERY request

    # In real production: OOM after thousands of requests
    # For demo: fails after 10 entries
    if len(_referral_cache) > 10:
        raise RuntimeError("Service degraded: referral cache exhausted")

    # ... actual validation
```

## The Fix
Remove the cache entirely — just query the database directly:
```python
def validate_referral(code: str):
    with engine.connect() as conn:
        result = conn.execute(
            select(ReferralPartner).where(ReferralPartner.code == code)
        )
        return result.scalar_one_or_none()
```

---

# Step-by-Step Demo

## STEP 1: Reset the Environment
```bash
kubectl rollout restart deployment/vote-api -n conference-app
kubectl rollout status deployment/vote-api -n conference-app --timeout=60s
```

## STEP 2: Demonstrate the Bug (WITHOUT mirrord)
Run this to simulate audience traffic with referral codes:
```bash
echo "=== DEMONSTRATING THE BUG ==="
for i in {1..15}; do
  echo "Request $i:"
  curl -s -X POST http://honey-we-have-a-problem.freeddns.org/vote \
    -H "Content-Type: application/json" \
    -d '{"choice": "ai", "referral": "conf-partner-2026"}'
  echo ""
  sleep 0.5
done
```

**Expected output:**
- Requests 1-10: `{"status": "ok", "choice": "ai"}` - Votes succeed
- Requests 11+: `503 Service degraded: referral cache exhausted` - Cache bug triggered!

## STEP 3: Show the Problem
- The pod is still "healthy" (health checks pass)
- But every vote with a referral code fails
- Votes without referral still work fine
- This is a classic "works in dev, breaks in prod" scenario

## STEP 4: Apply the Fix Locally
Edit `app/referral.py` - remove the unbounded cache entirely:

```python
from sqlalchemy import select
from app.database import engine
from app.models import ReferralPartner

def validate_referral(code: str):
    with engine.connect() as conn:
        result = conn.execute(
            select(ReferralPartner).where(ReferralPartner.code == code)
        )
        return result.scalar_one_or_none()
```

## STEP 5: Test the Fix with mirrord
Launch from VS Code using the "Python: FastAPI with mirrord" debug configuration (F5).

Or from the CLI:
```bash
mirrord exec -f mirrord.json -- ./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

In another terminal, run the same test:
```bash
echo "=== TESTING THE FIX WITH MIRRORD ==="
for i in {1..15}; do
  echo "Request $i:"
  curl -s -X POST http://honey-we-have-a-problem.freeddns.org/vote \
    -H "Content-Type: application/json" \
    -d '{"choice": "ai", "referral": "conf-partner-2026"}'
  echo ""
  sleep 0.5
done
```

**Expected output:**
- ALL requests succeed: `{"status": "ok", "choice": "ai"}`
- Traffic is stolen to your local machine where the fix is applied
- The buggy pod never sees these requests

## STEP 6: Wrap Up
- Stop mirrord (Ctrl+C or stop the debugger)
- The cluster still has the buggy code (intentionally — the demo is always ready)
- In a real scenario, you'd now deploy the fix with confidence

---

# Quick Test Commands

**Trigger bug:**
```bash
for i in {1..15}; do curl -s -X POST http://honey-we-have-a-problem.freeddns.org/vote -H "Content-Type: application/json" -d '{"choice": "ai", "referral": "conf-partner-2026"}'; echo ""; sleep 0.5; done
```

**Reset pod (clears the cache):**
```bash
kubectl rollout restart deployment/vote-api -n conference-app && kubectl rollout status deployment/vote-api -n conference-app --timeout=60s
```

**Check pod status:**
```bash
kubectl get pods -n conference-app -l app=vote-api
```

**Single test vote:**
```bash
curl -s -X POST http://honey-we-have-a-problem.freeddns.org/vote -H "Content-Type: application/json" -d '{"choice": "ai", "referral": "conf-partner-2026"}'
```

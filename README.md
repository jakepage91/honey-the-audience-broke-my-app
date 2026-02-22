# Honey, the Audience Broke My App

A conference polling application designed for a live debugging demo. The audience votes on a poll, unknowingly triggers an unbounded cache bug, and watches the app fail in real-time. The speaker then debugs and fixes it live using mirrord.

## What This Is

This is a complete, cluster-ready conference polling app with a **90s New York City theme**. Think yellow cabs, graffiti fonts, brick textures, and neon signs.

**The Poll Question:** "What's your go-to debugging strategy?"

**Options:**
- Add more print statements
- Stare at the code until it confesses
- Ask an AI to explain it
- Revert and pretend it never happened
- Turn it off and on again

## Architecture

```
[Audience phones] → [Ingress] → [vote-api (FastAPI)] → [Redis (live counts)]
                                         ↓
                                  [PostgreSQL (persistent + referral_partners)]

[Prometheus] → scrapes /metrics from vote-api
[Alertmanager] → fires alerts to Slack when error rate spikes
```

## Quick Start (Local Development)

### Prerequisites
- Docker and Docker Compose
- Python 3.12+

### Run Locally

```bash
# Start all services
docker-compose up -d

# Wait for PostgreSQL to be ready, then open:
# Voting page: http://localhost:8000/
# Results dashboard: http://localhost:8000/results
```

## Deploying to Kubernetes

### Prerequisites
- Kubernetes cluster (1.25+)
- Helm 3.x
- kubectl configured

### Deploy

A `my-secrets.yaml.example` file is included in the repo as a template. Copy it and fill in your real values — the real file is gitignored so it will never be committed accidentally.

```bash
cp my-secrets.yaml.example my-secrets.yaml
# Edit my-secrets.yaml with your Slack webhook URL and DB password
```

Then deploy:

```bash
helm upgrade --install conference-app helm/conference-app \
  --namespace conference-app \
  -f my-secrets.yaml
```

### Build and Push the Image

The image is published to GitHub Container Registry:

```bash
# Build for linux/amd64 (required for most cloud clusters)
docker buildx build --platform linux/amd64 --push \
  -t ghcr.io/<your-gh-username>/vote-api:v1.13.0 .
```

If the package is private, create an imagePullSecret in the cluster before deploying:

```bash
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=<your-gh-username> \
  --docker-password=$(gh auth token) \
  --namespace=conference-app
```

Then reference it in `values.yaml`:

```yaml
voteApi:
  image:
    repository: ghcr.io/<your-gh-username>/vote-api
    pullSecrets:
      - name: ghcr-pull-secret
```

## DNS Setup

### 1. Deploy Ingress Controller First

Install nginx-ingress via Helm (recommended over the static manifest):

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=LoadBalancer \
  --wait --timeout=3m

# Get the external IP
kubectl get svc -n ingress-nginx ingress-nginx-controller
```

### 2. Configure FreeDNS

1. Log in to [freedns.afraid.org](https://freedns.afraid.org/)
2. Find the `honey-we-have-a-problem.freeddns.org` record
3. Set the **A record** to your ingress controller's external IP
4. Save

### 3. Verify DNS Propagation

```bash
dig honey-we-have-a-problem.freeddns.org
```

FreeDNS typically propagates in **under 5 minutes** since it uses low TTLs for dynamic DNS.

## Slack Alerting Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name it "SRE Alerts" and select your workspace
4. Go to "Incoming Webhooks" → Enable it
5. Click "Add New Webhook to Workspace"
6. Select the channel (e.g., `#sre-alerts`)
7. Copy the webhook URL

### 2. Configure the Secret

Add the webhook URL to your `my-secrets.yaml` before deploying:

```yaml
secrets:
  slack:
    webhookUrl: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

This gets picked up automatically when you run `helm upgrade --install ... -f my-secrets.yaml`.

## Running the Demo

### Setup (Before the Talk)

1. Deploy the application to your Kubernetes cluster
2. Verify everything is working: visit the voting page and results dashboard
3. Generate two QR codes with [this tool](https://www.qrcode-monkey.com/):
   - **Left QR:** `http://honey-we-have-a-problem.freeddns.org/` (no referral)
   - **Right QR:** `http://honey-we-have-a-problem.freeddns.org/?referral=conf-partner-2026` (with referral)
4. Display QR codes on the projector
5. Open the results dashboard (`/results`) on the projector

### During the Talk

1. **Phase 1 - Normal Operation**
   - Ask audience to scan the LEFT QR code and vote
   - Watch votes come in on the results dashboard
   - Everything works fine

2. **Phase 2 - Trigger the Bug**
   - Ask audience to scan the RIGHT QR code (with referral parameter)
   - After 10 votes with referral codes, the service degrades
   - All subsequent referral votes return 503 errors
   - Slack alerts fire (ReferralCacheExhausted)
   - **Key point**: The pod stays healthy — health checks pass, but the service is degraded

3. **Phase 3 - Debug with mirrord**
   - Show the error in logs/metrics
   - Use mirrord to steal production traffic to your local machine
   - Identify the unbounded cache in `app/referral.py`
   - Apply the fix locally (remove the cache)
   - All 15+ requests now succeed through mirrord

### Expected Timing

- First 10 referral votes → succeed normally
- Vote 11+ with referral → 503 "referral cache exhausted"
- Votes without referral → always work fine (the bug only affects referral path)

### Between Talks (Resetting for Next Session)

Reset the pod to clear the in-memory cache:

```bash
kubectl rollout restart deployment/vote-api -n conference-app
kubectl rollout status deployment/vote-api -n conference-app --timeout=60s
```

Also click the **"RESET SESSION"** button on the results dashboard to clear vote counts.

## Debugging with mirrord

### Install mirrord

```bash
# macOS
brew install metalbear-co/mirrord/mirrord

# Or via curl
curl -fsSL https://raw.githubusercontent.com/metalbear-co/mirrord/main/scripts/install.sh | bash
```

### Connect to the Cluster

**Option 1: VS Code** (recommended for demo)

Use the "Python: FastAPI with mirrord" launch configuration — press F5 in VS Code. The `.mirrord/mirrord.json` config is auto-detected.

**Option 2: CLI**

```bash
mirrord exec -f mirrord.json -- ./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

This will:
- Steal all traffic from the vote-api pod
- Use the cluster's environment variables (DATABASE_URL, REDIS_URL, CONFERENCE, etc.)
- Let you debug locally while receiving real production traffic

### The Fix

The bug is in `app/referral.py`. An unbounded list grows with every referral validation:

```python
# Buggy code (deployed)
_referral_cache = []  # Never cleared, grows forever

def validate_referral(code: str):
    cache_entry = {"code": code, "timestamp": time.time(), "validated": True}
    _referral_cache.append(cache_entry)  # Grows on EVERY request

    if len(_referral_cache) > 10:
        raise RuntimeError("Service degraded: referral cache exhausted")
    # ...
```

```python
# Fixed code (apply locally, test via mirrord)
def validate_referral(code: str):
    with engine.connect() as conn:
        result = conn.execute(
            select(ReferralPartner).where(ReferralPartner.code == code)
        )
        return result.scalar_one_or_none()
```

**Important**: The fix is only applied locally during the demo. The cluster always runs the buggy version so the demo is always ready.

## Conference Branding

The app supports per-conference branding via the `CONFERENCE` environment variable:

```yaml
# helm/conference-app/values.yaml
voteApi:
  conference: "sreday"  # Options: sreday, kubecon, devopsdays
```

This displays the conference logo on the voting and results pages, and a welcome banner for attendees.

## Project Structure

```
honey-the-audience-broke-my-app/
├── app/
│   ├── main.py              # FastAPI app, routes, SSE
│   ├── models.py            # SQLAlchemy models
│   ├── database.py          # Engine, pool config
│   ├── redis_client.py      # Redis connection
│   ├── referral.py          # THE BUG LIVES HERE
│   ├── metrics.py           # Prometheus metrics
│   └── static/              # Frontend files
├── scripts/
│   ├── seed_referral_data.py
│   └── init_db.sql
├── helm/conference-app/     # Kubernetes manifests
├── .mirrord/mirrord.json    # mirrord config for VS Code (steal mode)
├── mirrord.json             # mirrord config for CLI (steal mode)
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Metrics & Monitoring

### Prometheus Metrics

- `http_requests_total{method, endpoint, status}` - Request counter
- `http_request_duration_seconds{method, endpoint}` - Request latency histogram
- `referral_cache_exhausted_total` - Cache exhaustion error counter
- `db_pool_checked_out` - DB connections currently in use
- `db_pool_size` - Total pool size

### Alert Rules

- **VoteAPIErrorRateHigh**: Error rate > 50% for 30s
- **VoteAPIHighLatency**: P95 latency > 2s for 1m
- **ReferralCacheExhausted**: Cache exhaustion errors detected (fires within 5s, keeps firing for 5m)
- **VoteAPIDown**: API unreachable for 10s

---

<details>
<summary><strong>Spoiler: The Bug Explained</strong></summary>

### The Unbounded Cache

The `validate_referral()` function in `app/referral.py` appends to a module-level list on every call:

1. Each referral validation creates a dict with the code, timestamp, and validation status
2. This dict is appended to `_referral_cache` — a list that is **never cleared**
3. After 10 entries, the function raises a `RuntimeError` (simulating OOM from memory pressure)
4. Once triggered, **every subsequent referral request fails** because the list only grows

In real production, this pattern would cause gradual memory growth until OOM. For the demo, we fail fast after 10 entries to make it obvious and reproducible.

### Why It's Hard to Catch

- The pod stays healthy (health/ready checks pass)
- Votes without referral codes work fine
- You'd never hit 10+ referral requests in local testing
- The cache is module-level state — invisible unless you read the code carefully

### The Fix

Remove the unbounded cache entirely — just query the database directly:

```python
def validate_referral(code: str):
    with engine.connect() as conn:
        result = conn.execute(
            select(ReferralPartner).where(ReferralPartner.code == code)
        )
        return result.scalar_one_or_none()
```

</details>

---

## License

MIT

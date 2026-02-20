# Honey, the Audience Broke My App

A conference polling application designed for a live debugging demo. The audience votes on a poll, unknowingly triggers a connection leak bug, and watches the app fail in real-time. The speaker then debugs and fixes it live using mirrord.

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

**Note:** The connection leak bug only manifests against the seeded 500k-row database in Kubernetes. Local docker-compose is for basic functional testing.

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
helm upgrade --install conference-app oci://ghcr.io/jakepage91/conference-app \
  --version 1.0.0 \
  --namespace conference-app \
  --create-namespace \
  -f my-secrets.yaml
```

> **Note:** The seed job inserts 500,000 rows into PostgreSQL and runs as a post-install hook. It takes ~60-90 seconds to complete. If it fails due to a transient error, delete the job and rerun the same `helm upgrade --install` command.

### Build and Push the Image

The image is published to GitHub Container Registry:

```bash
# Build for linux/amd64 (required for Civo/most cloud clusters)
docker buildx build --platform linux/amd64 --push \
  -t ghcr.io/<your-gh-username>/vote-api:v1.0.0 .
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

The current deployment points to `212.2.246.153` (Civo cluster `silent-snow-29182266`).

### 3. Verify DNS Propagation

```bash
# Check if DNS is resolving
dig honey-we-have-a-problem.freeddns.org

# Or
nslookup honey-we-have-a-problem.freeddns.org
```

FreeDNS typically propagates in **under 5 minutes** since it uses low TTLs for dynamic DNS.

### Timing Recommendations

| When | Task |
|------|------|
| Day before | Set up cluster, ingress controller, and DNS |
| 1 hour before | Verify everything works, do a test vote |
| 15 min before | Final check |

If your cluster IP changes, just update the A record in FreeDNS — changes are near-instant.

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
   - After ~5 votes with referral, the app starts timing out
   - Results dashboard stops updating
   - Slack alerts fire

3. **Phase 3 - Debug with mirrord**
   - Show the error in logs/metrics
   - Use mirrord to connect locally to the cluster
   - Debug and identify the connection leak
   - Show the fix

### Expected Timing

- 3 referral votes → connections start leaking (pool size is 3)
- ~1-2 seconds after pool exhaustion → Slack alert fires (Prometheus scrapes every 1 second, alert fires after 1s)
- Error rate goes to 100% → all requests hang or timeout

### Between Talks (Resetting for Next Session)

Click the **"RESET SESSION"** button in the top-right of the results dashboard to:
- Clear all votes from the database
- Reset Redis cache to zero
- Keep the 500k referral_partners table intact (no need to re-seed)

This takes ~1 second and prepares the app for your next demo session.

## Debugging with mirrord

### Install mirrord

```bash
# macOS
brew install metalbear-co/mirrord/mirrord

# Or via curl
curl -fsSL https://raw.githubusercontent.com/metalbear-co/mirrord/main/scripts/install.sh | bash
```

### Connect to the Cluster

```bash
# From the project root
mirrord exec -f mirrord.json python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

This will:
- Intercept traffic from the vote-api pods
- Use the cluster's environment variables (DATABASE_URL, REDIS_URL)
- Let you debug locally while receiving real traffic

### The Fix

The bug is in `app/referral.py`. The connection is not properly closed when an exception occurs:

```python
# Buggy code (current)
def validate_referral(code: str):
    conn = engine.connect()
    result = conn.execute(...)
    partner = result.scalar_one_or_none()
    conn.close()  # Never reached if query times out!
    return partner
```

```python
# Fixed code
def validate_referral(code: str):
    with engine.connect() as conn:  # Context manager ensures cleanup
        result = conn.execute(...)
        partner = result.scalar_one_or_none()
        return partner
```

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
├── tests/
├── helm/conference-app/     # Kubernetes manifests
├── mirrord.json             # mirrord config (steal mode)
├── mirrord-mirror.json      # mirrord config (mirror mode)
├── my-secrets.yaml.example  # secrets template (copy to my-secrets.yaml)
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Metrics & Monitoring

### Prometheus Metrics

- `http_requests_total{method, endpoint, status}` - Request counter
- `http_request_duration_seconds{method, endpoint}` - Request latency histogram
- `db_pool_checked_out` - Connections currently in use
- `db_pool_size` - Total pool size

### Alert Rules

- **VoteAPIErrorRateHigh**: Error rate > 50% for 30s
- **VoteAPIHighLatency**: P95 latency > 2s for 1m
- **DatabasePoolExhausted**: All connections in use for 1s (pool size: 3)
- **VoteAPIDown**: API unreachable for 10s

## Development

### Run Tests

```bash
pip install -r requirements.txt -r requirements-dev.txt
pytest tests/ -v
```

### Lint

```bash
ruff check .
```

---

<details>
<summary><strong>Spoiler: The Bug Explained</strong></summary>

### The Connection Leak

The `referral_partners` table has **500,000 rows** with **no index** on the `code` column. When a referral code is validated:

1. The query does a full table scan
2. PostgreSQL is configured with a **100ms** `statement_timeout`
3. The query exceeds the timeout and PostgreSQL kills it
4. An exception is raised in Python
5. `conn.close()` is never called because it's after the exception
6. The connection is returned to the pool in a broken state (or leaked entirely)

The connection pool is configured with:
- `pool_size=3`
- `max_overflow=0`

After 3 leaked connections, every subsequent request blocks indefinitely waiting for a connection that will never come back.

### Why Tests Pass

The unit tests use mocks and a small test database. The bug is timing-dependent and only manifests when:
1. The referral_partners table has 500k rows
2. The statement_timeout is set to 100ms
3. Multiple referral requests are made in quick succession

### The Fix

Use a context manager:

```python
def validate_referral(code: str):
    with engine.connect() as conn:
        result = conn.execute(
            select(ReferralPartner).where(ReferralPartner.code == code)
        )
        return result.scalar_one_or_none()
```

The context manager ensures `conn.close()` is called even if an exception occurs.

</details>

---

## License

MIT

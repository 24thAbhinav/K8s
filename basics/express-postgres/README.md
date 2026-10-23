# Express + Postgres on Kind (ClusterIP)

Minimal demo: an Express backend reads from Postgres. Both run **inside** the Kind cluster and are exposed only via **ClusterIP** Services. You view the data through `kubectl port-forward`.

```
Browser → (port-forward) → express ClusterIP :3000 → Express pod ──pg──> postgres ClusterIP :5432 → Postgres pod
```

## Files

| File | Purpose |
| ------ | --------- |
| `app/server.js` | Express app — `/` (HTML table), `/api/items` (JSON), `/healthz` |
| `app/package.json` | Dependencies: `express`, `pg` |
| `app/Dockerfile` | Builds the app image (`node:20-alpine`) |
| `namespace.yaml` | The `backend` namespace |
| `postgres.yaml` | Postgres Deployment + ClusterIP Service |
| `express.yaml` | Express Deployment + ClusterIP Service |

## Getting the image into the cluster

`docker build` stores the image in Docker Desktop on your Mac. Kind nodes run their **own** containerd (inside the node containers) and don't share that store — so an already-running cluster doesn't help. The image must be **loaded** or **pulled**:

**Path A — load it onto the nodes (best for local dev):**

```bash
docker build -t express-pg-demo:1.0 app
kind load docker-image express-pg-demo:1.0 --name my-cluster
```

**Path B — push to a registry and let the nodes pull:**

```bash
docker build -t <registry>/express-pg-demo:1.0 app
docker push <registry>/express-pg-demo:1.0
# then edit express.yaml: image: <registry>/express-pg-demo:1.0
# (and set imagePullPolicy: Always if using the :latest tag)
```

Either way `express.yaml` uses `imagePullPolicy: IfNotPresent`, so the node uses the local image instead of trying (and failing) to pull `express-pg-demo:1.0` from a registry.

## Run

```bash
cd basics/express-postgres

# 1. Build + load the image (see "Getting the image into the cluster" above)
docker build -t express-pg-demo:1.0 app
kind load docker-image express-pg-demo:1.0 --name my-cluster

# 2. Deploy (namespace first)
kubectl apply -f namespace.yaml
kubectl apply -f postgres.yaml
kubectl apply -f express.yaml

# 3. Wait until both pods are Ready
kubectl get pods -n backend -w

# 4. Port-forward the Express ClusterIP Service to your machine
kubectl port-forward -n backend svc/express 3000:3000
```

Then open:

- <http://localhost:3000> — HTML page listing the seeded `items`
- <http://localhost:3000/api/items> — same data as JSON

## Notes

- **ClusterIP only** — nothing is exposed outside the cluster; other Pods reach `postgres` at `postgres:5432` (full DNS: `postgres.backend.svc.cluster.local:5432`).
- **Seeding** — the Express app creates the `items` table and inserts the sample rows on startup, but only if the table is empty.
- **Ephemeral data** — Postgres uses no volume, so data resets if the Postgres pod is recreated; the app re-seeds on the next start.
- **Credentials live in the manifests** (plain env values) — fine for a local demo, not for anything real.
- **After editing the app:** rebuild, reload (Path A), restart:
  ```bash
  docker build -t express-pg-demo:1.0 app
  kind load docker-image express-pg-demo:1.0 --name my-cluster
  kubectl rollout restart deployment/express -n backend
  ```

## Teardown

```bash
kubectl delete namespace backend
```

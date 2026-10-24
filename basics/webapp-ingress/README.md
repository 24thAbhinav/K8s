# Webapp: frontend + backend + postgres behind an Ingress

Same app as `../webapp-nginx-routing`, but routing is done by an **Ingress** instead of a hand-written NGINX config. The **NGINX Ingress Controller** (installed separately) reads the `Ingress` object and proxies traffic.

```mermaid
flowchart LR
  Browser(["Browser<br/>localhost:80"])
  IC["Ingress Controller (nginx Pod)<br/><i>hostPort :80</i>"]
  subgraph ns["namespace: webapp-ingress"]
    direction LR
    ING["Ingress: webapp-ingress<br/>/ → frontend · /api → backend"]
    FS["Service: frontend<br/><i>ClusterIP :80</i>"]
    FP["Pod: frontend<br/>:80"]
    BS["Service: backend<br/><i>ClusterIP :3000</i>"]
    BP["Pod: backend<br/>:3000"]
    PS["Service: postgres<br/><i>ClusterIP :5432</i>"]
    PP["Pod: postgres<br/>:5432"]
    ING --> FS
    ING --> BS
    FS --> FP
    BS --> BP
    BP -->|"PGHOST=postgres:5432"| PS
    PS --> PP
  end
  Browser --> IC
  IC -->|"reads Ingress rules"| ING
```

The difference from the nginx example: there you write the `nginx.conf` yourself; here you declare **routing rules** and the controller does the rest.

> No load balancer locally? See **[WITHOUT-LOADBALANCER.md](./WITHOUT-LOADBALANCER.md)** for a diagrammed walkthrough of how the traffic reaches the Ingress on Kind.

## Files

| File / Folder                       | Purpose                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `kind-config.yaml`                  | Kind config — mapping host :80/:443 and labeling the node `ingress-ready` |
| `namespace.yaml`                    | The `webapp-ingress` namespace                                            |
| `postgres.yaml`                     | Postgres Deployment + ClusterIP Service                                   |
| `backend/server.js`                 | Express API — `/api/items`, `/healthz`; seeds the DB on startup           |
| `backend/{package.json,Dockerfile}` | Backend image (`node:20-alpine`)                                          |
| `backend.yaml`                      | Backend Deployment + ClusterIP Service                                    |
| `frontend.yaml`                     | Frontend page (ConfigMap) + Deployment + ClusterIP Service                |
| `ingress.yaml`                      | The Ingress — `/` → frontend, `/api` → backend                            |

## Run

```bash
cd basics/webapp-ingress

# 1. Create an ingress-ready cluster (maps host :80/:443; delete any existing first)
kind create cluster --name my-cluster --config kind-config.yaml

# 2. Install the NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

# Pin the controller to the ingress-ready node (the one with the host ports mapped).
# The upstream Kind manifest does NOT do this, so it can otherwise land on a worker
# where :80/:443 aren't mapped — and http://localhost would fail.
kubectl patch deployment ingress-nginx-controller -n ingress-nginx --type merge \
  -p '{"spec":{"template":{"spec":{"nodeSelector":{"ingress-ready":"true"}}}}}'
kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx

# 3. Build + load the backend image
docker build -t webapp-backend:1.0 backend
kind load docker-image webapp-backend:1.0 --name my-cluster

# 4. Deploy the app
kubectl apply -f namespace.yaml
kubectl apply -f postgres.yaml
kubectl apply -f backend.yaml
kubectl apply -f frontend.yaml
kubectl apply -f ingress.yaml

# 5. Wait until ready
kubectl get pods -n webapp-ingress -w
```

Then open <http://localhost> — the page shows the items, fetched from the backend through the Ingress.

- <http://localhost/api/items> — the raw JSON from the backend

## If you have a real LoadBalancer (cloud or MetalLB)

The Kind-specific parts above exist only because a local cluster has no load-balancer provisioner. Where the `LoadBalancer` Service actually gets an IP, you drop them.

**1. `kind-config.yaml` → a plain cluster.** Remove `extraPortMappings` and the `ingress-ready` label:

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
```

**2. Install step → drop the `nodeSelector` patch.** No pinning needed:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
# (no `kubectl patch ... nodeSelector` — that block is Kind-only)
```

**Unchanged:** everything else — `namespace.yaml`, `postgres.yaml`, `backend.yaml`, `frontend.yaml`, and `ingress.yaml` (the Ingress rules are the same).

**Reach it via the LoadBalancer's IP** instead of `localhost`:

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller
# NAME                       TYPE           EXTERNAL-IP     PORT(S)
# ingress-nginx-controller   LoadBalancer   203.0.113.10    80:30401/TCP,443:30580/TCP
#                                          ^ a real IP, not <pending>

curl http://203.0.113.10/            # → frontend
curl http://203.0.113.10/api/items   # → backend JSON
```

|                       | Kind (no LB)                                | Real cluster (LB)      |
| --------------------- | ------------------------------------------- | ---------------------- |
| `kind-config.yaml`    | `extraPortMappings` + `ingress-ready` label | plain cluster          |
| Controller install    | + `nodeSelector` patch (pin to node)        | plain install          |
| Reach the Ingress     | `http://localhost` (node hostPort)          | `http://<EXTERNAL-IP>` |
| Service `EXTERNAL-IP` | `<pending>`                                 | a real IP              |

## Notes

- **With a real load balancer, skip all the Kind-specific bits:** on a cloud cluster (or locally with MetalLB), the `ingress-nginx-controller` Service gets a real `EXTERNAL-IP` and the LoadBalancer handles getting traffic to the controller — so you don't need `extraPortMappings`, node hostPort bindings, or the node pinning. Those steps exist only because a plain Kind cluster has no load-balancer provisioner (the Service would sit at `<pending>`). You'd just point at the LB's external IP.
- **Why the custom `kind-config.yaml`:** the controller binds hostPorts 80/443 on the node; `extraPortMappings` publishes those to your Mac, so it's reachable at `localhost`. That mapping can only be set at cluster-creation time.
- **Pin the controller (important):** the controller Pod must run on the `ingress-ready` node — if it lands on a worker, `:80` isn't mapped and `http://localhost` returns nothing. That's why installation includes a `nodeSelector` patch.
- **The controller is separate:** `ingress-nginx` lives in its own namespace and is installed from the upstream manifest (not part of this folder).
- **Ingress routes to Services**, never directly to Pods; `postgres` is ClusterIP-only and never exposed.
- **Seeding / ephemeral data / credentials:** same as the other example — the backend seeds on startup, Postgres uses no volume, creds are plain env values (demo only).
- **First-boot 503:** you may briefly get `503` on `/` right after deploy — the controller reloads once the frontend Pod has endpoints. Retry after a few seconds.

## Teardown

```bash
kubectl delete namespace webapp-ingress
```

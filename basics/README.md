# Kubernetes Basics

A walkthrough of essential Kubernetes concepts and CLI commands for getting started locally with [Kind](https://kind.sigs.k8s.io/).

---

##  Files & Examples in This Folder

| File / Folder | Purpose |
| ------ | --------- |
| `kind-config.yaml` | Kind cluster config — 1 control-plane + 2 worker nodes |
| `namespace.yaml` | Namespace manifest (`backend-namespace`) — declarative namespace creation |
| `pod-manifest.yaml` | Declarative manifest for a single nginx Pod |
| `replicaset.yaml` | ReplicaSet that keeps 3 nginx Pod replicas running |
| `deployment.yml` | Deployment wrapping a ReplicaSet with rolling-update support |
| `service.yaml` | NodePort Service exposing the nginx Pod on port 30007 |
| `service-lb.yaml` | LoadBalancer Service (needs a cloud provider; `<pending>` locally) |
| `nginx.yaml` | NGINX reverse proxy — config (ConfigMap) + Deployment + ClusterIP Service |
| `express-postgres/` | Runnable example: Express + Postgres via ClusterIP (see its own README) |
| `webapp-nginx-routing/` | Example: frontend + backend + postgres routed by an NGINX Pod (reverse proxy), **not** Ingress (see its own README) |
| `webapp-ingress/` | Example: the same app routed by an **Ingress** / NGINX Ingress Controller (see its own README) |

---

## Kubernetes CLI

### Kind

```bash
kind create cluster --name my-cluster --config kind-config.yaml
```

Creates a Kind cluster using the given configuration.

```bash
kind get clusters
```

Lists all Kind clusters.

```bash
kind delete cluster --name my-cluster
```

Deletes the specified Kind cluster.

---

### kubectl

Commands are scoped to the current namespace unless you pass `-n <namespace>` (default: `default`). Add `-A` / `--all-namespaces` to cover every namespace.

Grouped by API object:

#### General

```bash
kubectl apply -f <file.yaml>
```

Creates or updates the resources defined in a manifest.

```bash
kubectl delete -f <file.yaml>
```

Deletes the resources defined in a manifest.

#### Pods

```bash
kubectl get pods
```

Lists Pods in the current namespace.

```bash
kubectl describe pod <pod-name>
```

Shows detailed information and events for a Pod.

```bash
kubectl logs <pod-name>
```

Prints a Pod's logs (`-f` to follow/stream).

```bash
kubectl run <pod-name> --image=<image-name>
```

Creates a Pod imperatively (mainly for testing; prefer manifests).

```bash
kubectl delete pod <pod-name>
```

Deletes a Pod.

#### Deployments

```bash
kubectl get deployments
```

Lists Deployments.

```bash
kubectl scale deployment <name> --replicas=3
```

Sets the desired replica count.

```bash
kubectl rollout restart deployment/<name>
```

Restarts the Pods (e.g. to pick up a newly loaded image). Other `rollout` subcommands are in the Deployment concept below.

```bash
kubectl delete deployment <name>
```

Deletes a Deployment (and the ReplicaSet/Pods it owns).

#### Services

```bash
kubectl get svc
```

Lists Services.

```bash
kubectl describe svc <service-name>
```

Shows Service details — type, selector, ClusterIP, and ports.

```bash
kubectl get endpoints <service-name>
```

Shows the Pod IPs the Service routes to (empty means the selector matches no ready Pods).

```bash
kubectl port-forward svc/<service-name> 8080:80
```

Forwards a local port to a Service — handy for local testing when NodePort isn't reachable.

```bash
kubectl expose deployment <name> --port=80 --type=NodePort
```

Creates a Service for an existing workload imperatively (prefer a manifest).

```bash
kubectl delete svc <service-name>
```

Deletes a Service.

#### Namespaces

```bash
kubectl get namespaces
```

Lists all namespaces (short form: `ns`).

```bash
kubectl create namespace <name>
```

Creates a namespace imperatively. You can also do it declaratively:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: <name>
```

then `kubectl apply -f <file>.yaml`.

```bash
kubectl delete namespace <name>
```

Deletes a namespace and everything inside it.

#### ConfigMaps

```bash
kubectl get configmaps
```

Lists ConfigMaps (short form: `cm`).

```bash
kubectl describe configmap <name>
```

Shows the keys and values of a ConfigMap.

```bash
kubectl create configmap <name> --from-literal=KEY=value
```

Creates a ConfigMap from a literal value — or from a file with `--from-file=<path>`.

#### Cluster & context

```bash
kubectl get nodes
```

Lists all nodes in the cluster.

```bash
kubectl config set-context --current --namespace=<name>
```

Sets the default namespace for the current context, so you can drop `-n` on every command. Check it with `kubectl config view --minify`; reset with `--namespace=default`.

---

### kubeconfig

```
~/.kube/config
```

Stores cluster information, credentials, contexts, and the active context used by `kubectl`.

---

##  Core Concepts

### Pod

The **smallest deployable unit** in Kubernetes. A Pod wraps one or more containers that share the same network namespace and storage volumes.

### ReplicaSet

Ensures that a **specified number of Pod replicas** are running at all times. If a Pod dies, the ReplicaSet creates a new one. Uses a **label selector** to track which Pods it owns.

```
ReplicaSet (replicas: 3)
 ├── Pod (nginx-rs)
 ├── Pod (nginx-rs)
 └── Pod (nginx-rs)
```

> In practice, you rarely create ReplicaSets directly — a **Deployment** manages ReplicaSets for you and adds rolling-update support.

### Deployment

The standard way to run stateless workloads. A Deployment owns and manages a ReplicaSet under the hood, and adds **rolling updates** and **rollback** support. Changing the pod template (e.g., bumping the image) triggers a new rollout — old pods are replaced gradually with zero downtime.

```
Deployment
 └── ReplicaSet (current)
      ├── Pod (nginx)
      ├── Pod (nginx)
      └── Pod (nginx)
```

Key rollout commands:

```bash
kubectl rollout history deployment/nginx-deployment          # see available revisions
kubectl rollout status  deployment/nginx-deployment
kubectl rollout undo    deployment/nginx-deployment
kubectl rollout undo    deployment/nginx-deployment --to-revision=1
```

### Service

A stable network endpoint in front of a set of Pods (selected by label). Three types:

| Type | Scope | Use for |
| ------ | ------- | --------- |
| **ClusterIP** | Internal only | Service-to-Service / Pod-to-Pod traffic inside the cluster |
| **NodePort** | Opens a port on every node | Simple external access (no TLS/certs) |
| **LoadBalancer** | Provisions an external LB via a cloud provider | Public exposure in the cloud |

**ClusterIP** — the default. Internally exposed; used by Pods/nodes to talk to each other. Other Pods reach it by DNS: `<service>.<namespace>.svc.cluster.local:<port>` — or the short forms `<service>` when in the same namespace, and `<service>.<namespace>` otherwise. Needed when self-hosting databases, Kafka, etc.

**NodePort** — exposes a port (`30000–32767`) on every node; visiting any node routes the request through cluster networking to the target Pod.

> On macOS with Docker Desktop you can't reach node IPs directly — nodes live inside a VM, so a host port must be mapped via `extraPortMappings` at cluster-creation time.

**LoadBalancer** — provisions an external load balancer through a cloud provider (e.g. DigitalOcean). It's an external component that lives outside the cluster, so deleting the cluster doesn't remove it — and the provider bills for it. Locally there's no external IP: `kubectl get svc` shows `<pending>`.

### Namespace

A virtual cluster inside a cluster — a way to group and isolate resources. Names must be unique **within** a namespace, not across the cluster.

Built-in namespaces:

- `default` — where resources go when you don't specify a namespace
- `kube-system` — cluster components (DNS, kube-proxy, etc.)
- `kube-public`, `kube-node-lease` — cluster-internal

Used to separate environments or teams (e.g. `dev`, `staging`, `prod`) and to apply quotas and RBAC per group. Scoped work with `-n <namespace>`.

### Ingress

A set of **HTTP routing rules** (host/path → Service). On its own an Ingress does nothing — the cluster must run an **Ingress Controller** (e.g. NGINX): that's the Pod that watches Ingress objects and actually proxies traffic. So the NGINX Pod is the entry point; the Ingress object is just the config it follows.

Say you have `frontend`, `backend`, and `db` Pods (each behind a ClusterIP Service). You run one NGINX ingress controller and point both apps at it:

```
Client → Ingress Controller (NGINX Pod, exposed via NodePort/LoadBalancer)
       → Ingress rules (host/path)
       → ClusterIP Services: frontend / backend
       → Pods
```

- Routes to **Services** (ClusterIP), never directly to Pods.
- One entry point for many apps: `/` → `frontend`, `/api` → `backend`.
- `db` stays ClusterIP-only — you don't expose a database through Ingress.

Minimal Ingress (uses the NGINX controller):

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
spec:
  ingressClassName: nginx
  rules:
    - host: myapp.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: backend
                port:
                  number: 8000
```

Needs an ingress controller installed (e.g. `ingress-nginx`). On Kind its Service uses NodePorts 80/443, so those must be mapped to the host via `extraPortMappings` at cluster-creation time — the same macOS/VM boundary as NodePort.

### ConfigMap

Holds **non-secret configuration** as key/value pairs (or whole files), kept outside the container image so the same image works in every environment.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  APP_MODE: production
  nginx.conf: |
    server { listen 80; }
```

A Pod consumes it by reference — there are three ways:

- **Env vars** — via `envFrom` or `valueFrom.configMapKeyRef`
- **Command args** — e.g. `--config=/etc/app/app.conf`
- **Mounted files** — mount the ConfigMap as a volume; each key becomes a file (see `nginx.yaml`, where `default.conf` is mounted into the NGINX Pod)

Caveats: env-var consumers only pick up changes after the Pod restarts, while mounted files update on their own (eventually). And **secrets don't go here** — passwords/tokens belong in a `Secret`.

---

##  Hands-On Walkthrough

### 1. Create the cluster

```bash
kind create cluster --name my-cluster --config kind-config.yaml
```

Verify the nodes are ready (should show 3 nodes: 1 control-plane + 2 workers):

```bash
kubectl get nodes
```

### 2. Run a single Pod

```bash
kubectl apply -f pod-manifest.yaml
kubectl get pods
kubectl describe pod nginx-pod
```

### 3. Deploy the ReplicaSet

```bash
kubectl apply -f replicaset.yaml

# Watch all 3 replicas come up
kubectl get pods -l app=nginx-rs

# Self-healing demo — delete one pod and watch RS recreate it
kubectl delete pod <one-of-the-rs-pods>
kubectl get pods -l app=nginx-rs
```

### 4. Deploy using a Deployment

```bash
kubectl apply -f deployment.yml

# Watch all 4 replicas come up
kubectl get pods -l app=nginx

# Check the Deployment and the ReplicaSet it created
kubectl get deployments
kubectl get replicasets

# Simulate a rollout by changing the image, then check status
kubectl rollout status deployment/nginx-deployment
```

### 5. Tear down

```bash
kubectl delete -f deployment.yml
kubectl delete -f replicaset.yaml
kubectl delete -f pod-manifest.yaml
kind delete cluster --name my-cluster
```

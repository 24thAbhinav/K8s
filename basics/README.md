# Kubernetes Basics

A walkthrough of essential Kubernetes concepts and CLI commands for getting started locally with [Kind](https://kind.sigs.k8s.io/).

---

##  Files in This Folder

| File | Purpose |
| ------ | --------- |
| `kind-config.yaml` | Kind cluster config — 1 control-plane + 2 worker nodes |
| `pod-manifest.yaml` | Declarative manifest for a single nginx Pod |
| `replicaset.yaml` | ReplicaSet that keeps 3 nginx Pod replicas running |
| `deployment.yml` | Deployment wrapping a ReplicaSet with rolling-update support |
| `service.yaml` | NodePort Service exposing the nginx Pod on port 30007 |
| `service-lb.yaml` | LoadBalancer Service (needs a cloud provider; `<pending>` locally) |

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

```bash
kubectl apply -f manifest.yml
```

Creates or updates resources defined in the manifest.

```bash
kubectl get nodes
```

Lists all nodes in the cluster.

```bash
kubectl get pods
```

Lists all pods in the current namespace.

```bash
kubectl describe pod <pod-name>
```

Shows detailed information and events for a pod.

```bash
kubectl logs <pod-name>
```

Prints the current logs of a pod.

```bash
kubectl logs -f <pod-name>
```

Streams logs continuously (`-f` = follow).

```bash
kubectl delete pod <pod-name>
```

Deletes the specified pod.

```bash
kubectl run <pod-name> --image=<image-name>
```

Creates a pod imperatively (mainly for testing; prefer manifests).

```bash
kubectl get svc
```

Lists all Services in the current namespace.

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
kubectl get namespaces
```

Lists all namespaces (short form: `ns`).

```bash
kubectl create namespace <name>
```

Creates a namespace.

```bash
kubectl get pods -n <namespace>
```

Scopes any command to a namespace. Use `--all-namespaces` (or `-A`) for every namespace.

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

**ClusterIP** — the default. Internally exposed; used by Pods/nodes to talk to each other. Needed when self-hosting databases, Kafka, etc.

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

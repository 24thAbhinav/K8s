# Kubernetes Basics

A walkthrough of essential Kubernetes concepts and CLI commands for getting started locally with [Kind](https://kind.sigs.k8s.io/).

---

## 📂 Files in This Folder

| File | Purpose |
| ------ | --------- |
| `kind-config.yaml` | Kind cluster config — 1 control-plane + 2 worker nodes |
| `pod-manifest.yaml` | Declarative manifest for a single nginx Pod |
| `replicaset.yaml` | ReplicaSet that keeps 3 nginx Pod replicas running |

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

---

### kubeconfig

```
~/.kube/config
```

Stores cluster information, credentials, contexts, and the active context used by `kubectl`.

---

## 🔑 Core Concepts

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

---

## 🚀 Hands-On Walkthrough

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

### 4. Tear down

```bash
kubectl delete -f replicaset.yaml
kubectl delete -f pod-manifest.yaml
kind delete cluster --name my-cluster
```

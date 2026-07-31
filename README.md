# ☸️ Kubernetes Learning Repo

A personal learning repository for Kubernetes concepts, manifests, and CLI references — built up progressively from the basics.

## 📁 Structure

```
K8s/
└── basics/
    ├── kind-config.yaml      # Kind 3-node cluster config
    ├── pod-manifest.yaml     # Basic Pod manifest
    ├── replicaset.yaml       # ReplicaSet manifest
    └── README.md             # CLI reference & basics walkthrough
```

## 🗺️ Learning Path

| Topic | Location | Status |
|-------|----------|--------|
| Kind cluster setup | `basics/kind-config.yaml` | ✅ |
| Pod manifest | `basics/pod-manifest.yaml` | ✅ |
| ReplicaSet | `basics/replicaset.yaml` | ✅ |
| Deployments | coming soon | 🔜 |
| Services | coming soon | 🔜 |
| ConfigMaps & Secrets | coming soon | 🔜 |

## 🚀 Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) — required by Kind
- [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) — Kubernetes IN Docker
- [kubectl](https://kubernetes.io/docs/tasks/tools/) — Kubernetes CLI

### Quick Start

```bash
# 1. Spin up a local 3-node cluster
kind create cluster --name my-cluster --config basics/kind-config.yaml

# 2. Verify nodes are ready
kubectl get nodes

# 3. Apply a pod manifest
kubectl apply -f basics/pod-manifest.yaml

# 4. Apply the ReplicaSet
kubectl apply -f basics/replicaset.yaml
```

---

> **Note:** All manifests target learning / local environments. Do not use them directly in production.

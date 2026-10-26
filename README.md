# Kubernetes Learning Repo

A personal learning repository for Kubernetes concepts, manifests, and CLI references — built up progressively from the basics, plus an end-to-end GitOps pipeline (GitHub Actions + Docker Hub + Argo CD).

## Structure

```
K8s/
├── .github/workflows/
│   └── argocd-backend-ci.yml     # CI: build image + update the GitOps repo
├── .gitignore
├── README.md
├── basics/
│   ├── kind-config.yaml          # Kind 3-node cluster config
│   ├── namespace.yaml            # Namespace manifest
│   ├── pod-manifest.yaml         # Basic Pod manifest
│   ├── replicaset.yaml           # ReplicaSet manifest
│   ├── service.yaml              # NodePort Service
│   ├── service-lb.yaml           # LoadBalancer Service
│   ├── nginx.yaml                # NGINX reverse proxy
│   ├── argocd/                   # GitOps CI/CD example (see its README)
│   ├── configmap-secret-port/    # ConfigMap + Secret example
│   ├── express-postgres/         # Express + Postgres example
│   ├── hpa-metrics-server/       # HPA + Metrics Server example
│   ├── pv-pvc-cloud/             # Dynamic PVC example
│   ├── pv-pvc-nfs-ec2/           # Static NFS PV/PVC example
│   ├── webapp-ingress/           # Ingress example
│   ├── webapp-nginx-routing/     # NGINX routing example
│   └── README.md                 # CLI reference & basics walkthrough
└── dailycode/
    ├── deployment.yml            # day-to-day nginx Deployment
    └── README.md                 # manifest index
```

## Learning Path

| Topic | Location | Status |
|-------|----------|--------|
| Kind cluster setup | `basics/kind-config.yaml` |  |
| Pod manifest | `basics/pod-manifest.yaml` |  |
| ReplicaSet | `basics/replicaset.yaml` |  |
| Deployments | `dailycode/deployment.yml` |  |
| Namespaces | `basics/namespace.yaml` |  |
| Services | `basics/service.yaml` |  |
| LoadBalancer Service | `basics/service-lb.yaml` |  |
| ConfigMaps & Secrets | `basics/configmap-secret-port/` |  |
| Express + Postgres | `basics/express-postgres/` |  |
| PersistentVolumes & PVCs (cloud) | `basics/pv-pvc-cloud/` |  |
| NFS storage (external EC2) | `basics/pv-pvc-nfs-ec2/` |  |
| HPA & Metrics Server | `basics/hpa-metrics-server/` |  |
| Ingress | `basics/webapp-ingress/` |  |
| NGINX routing (no Ingress) | `basics/webapp-nginx-routing/` |  |
| GitOps + CI/CD (Argo CD) | `basics/argocd/` |  |
| Daily use manifests | `dailycode/` |  |

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) — required by Kind and the backend image builds
- [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) — Kubernetes IN Docker
- [kubectl](https://kubernetes.io/docs/tasks/tools/) — Kubernetes CLI
- GitHub account, Docker Hub account, and Argo CD — only for the GitOps example (see `basics/argocd/README.md`)

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

# 5. Apply the Deployment
kubectl apply -f dailycode/deployment.yml
```

---

> **Note:** All manifests target learning / local environments. Do not use them directly in production. For the full GitOps + CI/CD walkthrough, see [`basics/argocd/README.md`](basics/argocd/README.md).

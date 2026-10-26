# Argo CD + GitHub Actions (Minimal GitOps Example)

A minimal Argo CD implementation. Any change pushed to `basics/argocd/backend/` on `main` triggers GitHub Actions, which:

1. builds a new image tagged with the commit's short SHA (`abhinavchauhan24/argocd-backend:<short-sha>`),
2. pushes it to Docker Hub,
3. updates the `image:` line in `k8s/deployment.yaml` in the GitOps repo (`24thAbhinav/GitOps`).

Argo CD watches the GitOps repo and rolls out the new image.

## What's in this folder

```text
basics/argocd/
├── README.md                  # this guide
├── argocd-application.yaml    # Argo CD Application
└── backend/
    ├── .dockerignore
    ├── Dockerfile
    ├── index.js
    └── package.json
```

- CI workflow: `.github/workflows/argocd-backend-ci.yml`
- Deployment/Service manifests: in the GitOps repo, under `k8s/`
- Cluster config: `basics/kind-config.yaml`

## How it works

1. You push a change to `basics/argocd/backend/` on `main`.
2. GitHub Actions (`argocd-backend-ci.yml`) builds the image for `linux/amd64` and `linux/arm64`, tags it with the 7-char short SHA, and pushes it to Docker Hub.
3. The workflow checks out the GitOps repo, rewrites the `image:` line in `k8s/deployment.yaml` to the new SHA, commits, and pushes.
4. Argo CD (Application `learning-argocd`) sees the new GitOps commit and syncs the Deployment and Service.
5. Kubernetes pulls the new image and performs a rolling update.

The image is always tagged by SHA, never `latest`.

> Multi-arch matters: Kind nodes on Apple Silicon are `arm64`, but the GitHub runner is `amd64`. The workflow uses QEMU to build both architectures.

## Setup from scratch

### 1. Start the cluster

```bash
kind create cluster --name argo-cluster --config basics/kind-config.yaml
kubectl get nodes
```

### 2. Deployment and Service (in the GitOps repo)

Argo CD deploys these from `24thAbhinav/GitOps`, under `k8s/`.

`k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: argocd-backend-deployment
spec:
  replicas: 4
  selector:
    matchLabels:
      app: argocd-backend
  template:
    metadata:
      labels:
        app: argocd-backend
    spec:
      containers:
        - name: argocd-backend
          image: abhinavchauhan24/argocd-backend:<short-sha>
          ports:
            - containerPort: 3000
```

`k8s/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: argocd-backend-service
spec:
  selector:
    app: argocd-backend
  ports:
    - protocol: TCP
      port: 3000
      targetPort: 3000
  type: ClusterIP
```

The image tag must already exist in Docker Hub, or the Pods stay in `ImagePullBackOff`.

### 3. Install Argo CD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.6/manifests/install.yaml
kubectl -n argocd rollout status deployment/argocd-server
kubectl -n argocd get pods
```

Wait for the `argocd-server` (and the other Argo CD) pods to be `Running`.

### 4. Expose Argo CD and get the admin secret

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
```

Get the initial `admin` password:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d
echo
```

Verify the API is reachable (self-signed cert, so `-k`):

```bash
curl -sk https://localhost:8080/api/version
```

Open the UI at `https://localhost:8080` and log in with `admin` and that password.

### 5. Create the Argo CD Application

```bash
kubectl apply -f basics/argocd/argocd-application.yaml
```

The Application points at the GitOps repo (`repoURL`, `path: k8s`, `targetRevision: main`) with auto-sync, `selfHeal: true`, and `prune: false`. This tells Argo CD to deploy the Deployment and Service.

If the Application already exists with the wrong source, patch it instead of recreating it:

```bash
kubectl -n argocd patch application learning-argocd --type=merge \
  -p '{"spec":{"source":{"repoURL":"https://github.com/24thAbhinav/GitOps.git","path":"k8s","targetRevision":"main"}}}'
```

### 6. Verify

```bash
kubectl -n argocd get application learning-argocd
kubectl get deployment argocd-backend-deployment
kubectl get pods -l app=argocd-backend
```

Expected: `Synced` / `Healthy`, Deployment `4/4`.

### Check it works via port-forward

Forward the Service to your local machine:

```bash
kubectl port-forward service/argocd-backend-service 3000:3000
```

Then in another terminal, hit the backend:

```bash
curl http://localhost:3000/
```

Expected response:

```json
{"health":"OK"}
```

If that returns `health: OK`, everything is wired up: CI built the image, GitOps updated the tag, and Argo CD rolled it out.

## Tokens and secrets

The workflow needs three secrets in the `K8s` repo (set them to a 30-day expiry):

| Secret | What | Scope |
| --- | --- | --- |
| `DOCKERHUB_USERNAME` | Docker Hub username | your account |
| `DOCKERHUB_TOKEN` | Docker Hub access token (Read & Write) | the image repo |
| `GITOPS_TOKEN` | GitHub fine-grained PAT | `24thAbhinav/GitOps`, Contents: Read and write |

- `GITOPS_TOKEN` is the PAT the workflow uses to push the image tag into GitOps (the built-in `GITHUB_TOKEN` can't push to another repo).
- Docker Hub token: Account settings -> Security -> New access token (Read & Write, 30 days).
- GitHub PAT: Settings -> Developer settings -> Fine-grained tokens -> only the `GitOps` repo, Contents: Read and write, 30 days.

Add them:

```bash
gh secret set DOCKERHUB_USERNAME --repo 24thAbhinav/K8s
gh secret set DOCKERHUB_TOKEN --repo 24thAbhinav/K8s
gh secret set GITOPS_TOKEN --repo 24thAbhinav/K8s
```

Rotate them before day 30, or CI fails at Docker login / the GitOps push.

## Triggering a deploy

```bash
# change something under basics/argocd/backend, then:
git add basics/argocd/backend
git commit -m "feat: update backend"
git push origin main
```

Manual (no code change):

```bash
gh workflow run argocd-backend-ci.yml --repo 24thAbhinav/K8s --ref main
gh run watch --repo 24thAbhinav/K8s
```

Confirm the GitOps repo got the new tag:

```bash
git -C /tmp/GitOps pull
grep image: /tmp/GitOps/k8s/deployment.yaml
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Username and password required` | Missing Docker Hub secrets |
| `403` / `Permission ... denied` on GitOps push | `GITOPS_TOKEN` expired or lacks Contents write |
| `ImagePullBackOff: no match for platform` | Image must include `arm64` — keep QEMU + both platforms |
| App `Synced` but no resources | Application `path` must be `k8s`, not `.` |
| Manual edits keep reverting | `selfHeal: true` — commit the change to GitOps instead |
| ClusterIP unreachable from the host | Use `kubectl port-forward` or add an Ingress |

## Clean up

```bash
kubectl delete -f basics/argocd/argocd-application.yaml
kubectl delete -f https://raw.githubusercontent.com/24thAbhinav/GitOps/main/k8s/deployment.yaml
kubectl delete -f https://raw.githubusercontent.com/24thAbhinav/GitOps/main/k8s/service.yaml
kubectl delete -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.6/manifests/install.yaml
kubectl delete namespace argocd
kind delete cluster --name argo-cluster
```

# ConfigMap → PORT (Express backend)

A tiny example showing how a **ConfigMap** feeds a value into a Pod. The ConfigMap holds `PORT`, the Deployment imports that key as the `PORT` env var, and the Express backend reads `process.env.PORT` and listens on it.

```mermaid
flowchart LR
  CM["ConfigMap: backend-config<br/>PORT=3000"]
  D["Deployment: backend<br/>env PORT ← configMapKeyRef"]
  P["Pod: backend<br/>listens on PORT"]
  S["Service: backend<br/>ClusterIP :3000"]
  CM -->|"key PORT"| D
  D --> P
  S -->|"routes to"| P
```

## Files

| File / Folder                       | Purpose                                                        |
| ----------------------------------- | -------------------------------------------------------------- |
| `configmap.yaml`                    | ConfigMap `backend-config` with `PORT: "3000"`                 |
| `backend/server.js`                 | Express app — reads `PORT`, logs it, listens on it             |
| `backend/{package.json,Dockerfile}` | Backend image (`node:20-alpine`)                               |
| `backend.yaml`                      | Deployment — imports `PORT` via `valueFrom.configMapKeyRef`    |
| `service.yaml`                      | ClusterIP Service on port 3000                                 |

## Run

```bash
cd basics/configmap-port

# 1. Build + load the image
docker build -t configmap-port-backend:1.0 backend
kind load docker-image configmap-port-backend:1.0 --name my-cluster

# 2. Create the ConfigMap, then the Deployment and Service
kubectl apply -f configmap.yaml
kubectl apply -f backend.yaml
kubectl apply -f service.yaml

# 3. Wait until it is ready
kubectl get pods -l app=backend -w

# 4. Reach it
kubectl port-forward svc/backend 8080:3000
```

Then open <http://localhost:8080> — it prints the port the backend is listening on. <http://localhost:8080/port> returns it as JSON.

## Verify PORT came from the ConfigMap

```bash
kubectl logs -l app=backend
# PORT = 3000 (imported from the backend-config ConfigMap)
# listening on port 3000

kubectl describe configmap backend-config
# Data
# ====
# PORT:  3000
```

## Change the port

Edit `PORT` in the ConfigMap, re-apply, and restart the Pod (env vars are only read at container start):

```bash
kubectl patch configmap backend-config --type merge -p '{"data":{"PORT":"4000"}}'
kubectl rollout restart deployment/backend
```

If you change `PORT`, also update the Service `targetPort` (and the Deployment `containerPort`) to the same number, otherwise the Service points at the wrong port.

## Notes

- **One key vs. all keys:** `valueFrom.configMapKeyRef` imports a **single** key (`PORT`). `envFrom.configMapRef` would import **every** key in the ConfigMap as an env var.
- **Values are strings:** the ConfigMap stores `"3000"` as text; the app converts it with `Number(port)`.
- **Env vars are fixed at start:** changing the ConfigMap does not update a running Pod — restart it (`kubectl rollout restart`).
- **`containerPort` / `targetPort` are not automatic:** they must match the port the app actually listens on.
- **Missing key = crash:** if `PORT` isn't set, the app exits, and the Pod goes into `CrashLoopBackOff` — a quick way to see the dependency.

## Teardown

```bash
kubectl delete -f service.yaml -f backend.yaml -f configmap.yaml
```

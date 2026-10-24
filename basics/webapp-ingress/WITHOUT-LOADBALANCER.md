# How the Ingress works without a LoadBalancer (Kind)

On a real cluster you reach the Ingress through a `LoadBalancer` that has an external IP. A local Kind cluster has **no load-balancer provisioner**, so that Service stays `<pending>` and is never in the traffic path. Here's what actually happens instead.

## The path

```mermaid
flowchart TD
  A["Browser on your Mac<br/>http://localhost"]
  B["Docker Desktop<br/>extraPortMappings: host :80 → node :80"]
  C["Kind node (control-plane)<br/>hostPort :80 bound by the controller Pod"]
  D["Ingress Controller (nginx Pod)<br/>matches the Ingress rules"]
  E1["Service: frontend :80"]
  E2["Service: backend :3000"]
  F1["Pod: frontend"]
  F2["Pod: backend"]
  G["Service: postgres :5432"]
  H["Pod: postgres"]

  A --> B --> C --> D
  D -->|"path /"| E1 --> F1
  D -->|"path /api"| E2 --> F2
  F2 -->|"pg"| G --> H
```

Notice the `LoadBalancer` Service is **not** in that chain. Traffic enters through the **node's hostPort**, not through an external IP.

## One request, hop by hop

```mermaid
sequenceDiagram
  participant U as Browser (Mac)
  participant DK as Docker (extraPortMappings)
  participant N as Node :80 (hostPort)
  participant IC as Ingress Controller
  participant S as Service (ClusterIP)
  participant P as Pod
  U->>DK: GET http://localhost/api/items
  DK->>N: host :80 → node :80
  N->>IC: node :80 → controller Pod :80
  IC->>IC: match Ingress: /api → backend
  IC->>S: proxy to backend Service :3000
  S->>P: forward to a backend Pod
  P-->>U: JSON response
```

## The pieces (and what each one does)

| Piece | What it does |
| --- | --- |
| **`extraPortMappings`** | Docker publishes a port on the node container to your Mac (`host :80 → node :80`). Set only when the cluster is created. |
| **`hostPort`** | The controller Pod binds port 80 **on its node**. So the node's port 80 goes straight to that Pod. |
| **Ingress Controller** | The nginx Pod that reads `Ingress` objects and proxies the request. |
| **`Ingress` object** | Just the rules: `/` → `frontend`, `/api` → `backend`. |
| **ClusterIP Services** | Normal internal Services; the controller routes to these. |
| **`LoadBalancer` Service** | Exists, but `EXTERNAL-IP: <pending>` — **unused** here. |

## Why the controller must run on the **control-plane**, not a worker

Your Mac only ever reaches **one** node: the **control-plane**, because that's where `extraPortMappings` publishes `host :80 → node :80`. The **worker nodes have no port mapping**, so they aren't reachable from your Mac at all.

So if the controller Pod lands on a **worker**, this happens:

- your browser hits the **control-plane's** port 80,
- but nothing there is listening (the controller is on the worker),
- → connection refused (`curl` shows `000`).

That's exactly what happened during testing: the controller drifted from the control-plane to `my-cluster-worker`, and `http://localhost` broke until it was pinned back.

That's why the install step pins it:

```bash
kubectl patch deployment ingress-nginx-controller -n ingress-nginx --type merge \
  -p '{"spec":{"template":{"spec":{"nodeSelector":{"ingress-ready":"true"}}}}}'
```

## With a LoadBalancer (for contrast)

```mermaid
flowchart TD
  A["Browser<br/>http://EXTERNAL-IP"]
  LB["LoadBalancer<br/>(cloud / MetalLB)"]
  IC["Ingress Controller (nginx Pod)"]
  S["ClusterIP Service"]
  P["Pod"]
  A --> LB --> IC --> S --> P
```

With a real LB you skip all of the Kind plumbing: no `extraPortMappings`, no `hostPort`, no node pinning. You just point at the LB's external IP, and the LB forwards to the controller.

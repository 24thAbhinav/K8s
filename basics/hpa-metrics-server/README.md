# HPA + Metrics Server on Kind

A minimal, runnable HPA setup: install `metrics-server`, read metrics with `kubectl top`, then let the HPA controller scale a CPU-bound Deployment from 1 to 5 replicas.

The important correction up front:

- **`metrics-server` is one Deployment, not a per-node agent.** It runs as a single Pod (on a worker node here) and scrapes the kubelet on every node. It is not a DaemonSet.
- **The HPA controller is already installed.** It is part of `kube-controller-manager` on the control plane. You do not install it separately. On EKS/GKE/AKS it runs inside the managed control plane and is invisible to you.
- **cAdvisor is built into kubelet.** There is no separate cAdvisor Pod. Kubelet reads container cgroup stats and exposes them through its Summary API.
- **Pods do not push metrics.** `metrics-server` pulls them from kubelet every 15 seconds.

## What runs where (Kind environment)

```
my-cluster-control-plane
├── kube-apiserver                  (static Pod)
├── etcd                            (static Pod)
├── kube-scheduler                  (static Pod)
└── kube-controller-manager         (static Pod)
    └── HPA controller              ← already running, no install

my-cluster-worker / my-cluster-worker2
├── kubelet                         ← includes cAdvisor
└── containerd
    └── application Pods

my-cluster-worker (one of the workers)
└── metrics-server Pod              ← one replica, kube-system namespace
```

Check it:

```bash
kubectl get pods -n kube-system -o wide
kubectl get pods -n kube-system -o wide | grep -E 'metrics-server|kube-controller-manager'
```

Expected in this cluster:

```text
metrics-server-5b58578978-t85vb   1/1  Running  ...  10.244.2.7  my-cluster-worker
kube-controller-manager-my-cluster-control-plane  1/1  Running  ...  my-cluster-control-plane
```

`metrics-server` lands on a worker because the Kind control-plane node has a taint.

## The actual data flow

```
container cgroups on each node
        │
        ▼
cAdvisor (compiled into kubelet) reads CPU / memory / filesystem stats
        │
        ▼
kubelet Summary API over HTTPS on :10250
        ▲
        │  metrics-server scrapes every 15s (one Pod, all nodes)
        │
metrics-server Pod (kube-system)
        │  registers metrics.k8s.io/v1beta1 through an APIService
        ▼
kube-apiserver  (aggregation layer)
        ├──► kubectl top nodes / kubectl top pods
        └──► HPA controller (inside kube-controller-manager)
                 │
                 ▼
             scale subresource on the Deployment
                 │
                 ▼
             ReplicaSet creates or removes Pods
```

So the chain is:

```
Pod cgroups → kubelet/cAdvisor → metrics-server → kube-apiserver → HPA controller
```

It is not `Pod → metrics-server` and not `metrics-server → HPA controller` directly. The API server is the meeting point for both `kubectl top` and the HPA controller.

## 1. Install metrics-server

```bash
kubectl apply -f metrics-server.yaml
kubectl rollout status deployment/metrics-server -n kube-system
kubectl get apiservice v1beta1.metrics.k8s.io
```

Expected:

```text
NAME                     SERVICE                      AVAILABLE   AGE
v1beta1.metrics.k8s.io   kube-system/metrics-server   True        66s
```

Wait 15–30 seconds for the first scrape, then:

```bash
kubectl top nodes
kubectl top pods -A
```

Observed output in this cluster:

```text
NAME                       CPU(cores)   CPU(%)   MEMORY(bytes)   MEMORY(%)
my-cluster-control-plane   286m         3%       1166Mi          29%
my-cluster-worker          59m          0%       375Mi           9%
my-cluster-worker2         44m          0%       321Mi           8%
```

The manifest is the upstream `components.yaml` from metrics-server **v0.9.0** with one Kind-specific flag added:

```text
--kubelet-insecure-tls
```

Kind's kubelets use self-signed serving certificates, so metrics-server rejects them without this flag. On a real cloud cluster, remove that flag and use a CA-signed kubelet certificate.

## 2. See what a `top` command is doing

`kubectl top nodes` is not reading a local cache. It calls the API server, which proxies the metrics request to metrics-server.

If you use the common alias `k`, `k top nodes -v=6` is the same command. Use `-v=6` for readable request lines (`-v=8` also dumps headers and protobuf bodies, which is noisy but useful when debugging):

```bash
kubectl top nodes -v=6
kubectl top nodes -v=8
```

Observed requests:

```text
"Response" verb="GET" url="https://127.0.0.1:58400/api"                                  status="200 OK"
"Response" verb="GET" url="https://127.0.0.1:58400/apis"                                 status="200 OK"
"Response" verb="GET" url="https://127.0.0.1:58400/apis/metrics.k8s.io/v1beta1/nodes"   status="200 OK"
"Response" verb="GET" url="https://127.0.0.1:58400/api/v1/nodes"                         status="200 OK"
```

What each one means:

| Request | Purpose |
| ------- | ------- |
| `GET /api` and `GET /apis` | API discovery — kubectl finds the available API groups and versions |
| `GET /apis/metrics.k8s.io/v1beta1/nodes` | The aggregated Metrics API, served by metrics-server |
| `GET /api/v1/nodes` | Core Node objects, used to read `capacity` / `allocatable` so CPU and memory can be shown as `%` |

`127.0.0.1:58400` is the local port that kubectl opens to the API server through your kubeconfig.

You can call the aggregated API directly:

```bash
kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes | jq
kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/default/pods | jq
```

A node metric entry looks like this:

```json
{
  "metadata": { "name": "my-cluster-worker" },
  "timestamp": "2026-10-25T23:31:33Z",
  "window": "10.045s",
  "usage": {
    "cpu": "59m",
    "memory": "375Mi"
  }
}
```

`window` is the measurement interval. `metrics-server` keeps only the latest sample in memory; it is not a time-series database.

If the Metrics API is missing:

```text
error: Metrics API not available
```

Check the APIService first, then the Pod:

```bash
kubectl get apiservice v1beta1.metrics.k8s.io -o wide
kubectl logs -n kube-system deploy/metrics-server --tail=50
kubectl describe pod -n kube-system -l k8s-app=metrics-server
```

## 3. Run the HPA demo

`app.yaml` is a small Python HTTP server that burns CPU per request and requests `200m` CPU. The request is mandatory: HPA `averageUtilization` is a percentage **of the request**, not of the node or the limit.

```bash
kubectl apply -f app.yaml
kubectl apply -f hpa.yaml

kubectl rollout status deployment/cpu-app
kubectl get hpa cpu-app
```

At first the target can be `<unknown>` while the first sample is collected:

```text
NAME      REFERENCE            TARGETS              MINPODS   MAXPODS   REPLICAS
cpu-app   Deployment/cpu-app   cpu: <unknown>/50%   1         5         1
```

After one scrape interval:

```text
NAME      REFERENCE            TARGETS       MINPODS   MAXPODS   REPLICAS
cpu-app   Deployment/cpu-app   cpu: 1%/50%   1         5         1
```

Generate load in another terminal (or apply the Deployment):

```bash
kubectl apply -f load-generator.yaml
kubectl get hpa cpu-app -w
```

Observed scale-up:

```text
cpu: 1%/50%     1 replica
cpu: 79%/50%    2 replicas
cpu: 470%/50%   5 replicas
```

`kubectl get deploy cpu-app` and `kubectl top pods -l app=cpu-app` show the new Pods and their CPU usage.

Stop the load and watch it come back down:

```bash
kubectl delete -f load-generator.yaml
kubectl get hpa cpu-app -w
```

Observed scale-down to 1 replica after roughly 90 seconds (30-second stabilization window plus scrape lag).

## 4. How the HPA controller decides

The controller is looped by `kube-controller-manager`. Its default sync period is 15 seconds, and it queries the API server's Metrics API — it never talks to kubelet or metrics-server directly.

The CPU calculation is:

```text
desiredReplicas = ceil(currentReplicas × currentCPU / targetCPU)
```

With a `200m` request and a 50% target, the target usage is `100m` per Pod. If the average is `400m`:

```text
ceil(1 × 400m / 100m) = 4 replicas
```

There is a default 10% tolerance, so the controller does nothing when the ratio is between 0.9 and 1.1. It also avoids thrashing with scale-down stabilization (300 seconds by default; `hpa.yaml` sets 30 seconds for this demo).

Inspect the decision:

```bash
kubectl describe hpa cpu-app
```

Look for:

```text
ScalingActive   True   ValidMetricFound   the HPA was able to successfully calculate a replica count
ScalingLimited  False  DesiredWithinRange the desired count is within the acceptable range
```

If `ScalingActive` is `False`, the usual reasons are:

- metrics-server is not running or its APIService is not `Available=True`
- the Pod has no CPU request (percentage cannot be computed)
- the target Deployment has no ready Pods

## 5. Why this works differently on a cloud cluster

| Local Kind | Managed cloud (EKS/GKE/AKS) |
| ---------- | --------------------------- |
| You install metrics-server yourself | Often preinstalled, or install the provider's metrics-server |
| Kubelet uses self-signed certs → `--kubelet-insecure-tls` | Kubelet certs are trusted; do not use that flag |
| Control plane is a visible node with static Pods | Control plane is managed; you cannot see the HPA controller |
| Kind control-plane taint puts metrics-server on a worker | Scheduler places it normally |
| `kubectl top` uses the aggregated Metrics API | Same |

## Cleanup

```bash
kubectl delete -f load-generator.yaml
kubectl delete -f hpa.yaml
kubectl delete -f app.yaml
```

Keep metrics-server if you want `kubectl top` to remain available. Remove it with:

```bash
kubectl delete -f metrics-server.yaml
```

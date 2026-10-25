# PV / PVC backed by NFS on an External EC2

A minimal static PV/PVC pair where the storage lives on a separate EC2 instance. The NFS server runs in Docker and is exposed on TCP `2049`; Kubernetes mounts it over NFSv4.

```
EC2 (Docker: itsthenetwork/nfs-server-alpine, port 2049)
   /srv/nfs  ──exported as NFSv4 root "/"──►  PV (ec2-nfs-pv)
                                                  │
                                                  ▼
                                            PVC (ec2-nfs-pvc)
                                                  │
                                    Deployment "nfs-demo" (2 replicas, RWX)
```

## 1. EC2 NFS server

Create an EC2 instance in the same VPC as the cluster (Ubuntu or Amazon Linux, `t3.micro` is enough for a demo). In its security group allow:

| Type | Protocol | Port | Source |
| ---- | -------- | ---- | ------ |
| Custom TCP | TCP | `2049` | cluster node security group (or VPC CIDR, e.g. `10.0.0.0/16`) |

Do **not** open `2049` to `0.0.0.0/0`. NFSv4 only needs `2049`; rpcbind/port `111` is not required.

Install Docker and start the server:

```bash
# Ubuntu
sudo apt-get update && sudo apt-get install -y docker.io
# Amazon Linux: sudo yum install -y docker

sudo systemctl enable --now docker

sudo mkdir -p /srv/nfs
sudo chmod 0777 /srv/nfs   # demo only; use a proper uid/gid for real workloads

docker run -d \
  --name nfs \
  --privileged \
  --restart unless-stopped \
  -v /srv/nfs:/nfsshare \
  -e SHARED_DIRECTORY=/nfsshare \
  -e PERMITTED='10.0.0.0/16' \
  -e SYNC=true \
  -p 2049:2049 \
  itsthenetwork/nfs-server-alpine:latest
```

Replace `10.0.0.0/16` with your VPC CIDR so only cluster nodes can mount.

Verify from one of the Kubernetes nodes:

```bash
# Ubuntu/Debian: sudo apt-get install -y nfs-common
# Amazon Linux: sudo yum install -y nfs-utils

sudo mkdir -p /mnt/nfs-test
sudo mount -t nfs4 <EC2_PRIVATE_IP>:/ /mnt/nfs-test
touch /mnt/nfs-test/hello
ls -l /mnt/nfs-test
sudo umount /mnt/nfs-test
```

The image exports its share with `fsid=0`, so the client mounts `server:/` — the NFSv4 root maps to `/srv/nfs` on the EC2 host. A subdirectory such as `/srv/nfs/data` can be mounted as `server:/data` and used as the PV `path`.

Use a stable address for the server (a fixed private IP, Elastic IP, or DNS name). If the instance is stopped and its private IP changes, the PV will point at the wrong host.

## 2. PV, PVC, and workload

Edit `pv.yaml` and set `spec.nfs.server` to the EC2 private IP (or DNS name). Then apply:

```bash
kubectl apply -f pv.yaml
kubectl apply -f pvc.yaml
kubectl apply -f deployment.yaml
```

`storageClassName: ""` on the PVC opts out of any default StorageClass, so Kubernetes binds it to the static NFS PV instead of dynamically provisioning a cloud disk. `volumeName` makes the binding explicit.

## 3. Verify

```bash
kubectl get pv,pvc
kubectl get pods -l app=nfs-demo

kubectl exec deploy/nfs-demo -- tail -n 10 /data/log.txt
```

Both replicas append to the same `/data/log.txt`, which demonstrates `ReadWriteMany` — something an EBS volume (`ReadWriteOnce`) cannot do.

## How this differs from the cloud example

- This is a **static** PV: the administrator creates the PV, then the PVC binds to it. There is no provisioner creating volumes on demand.
- `capacity: 5Gi` is only used for PV/PVC matching; NFS does not enforce it. The real limit is the EC2 disk backing `/srv/nfs`.
- For dynamic NFS provisioning, install `nfs-subdir-external-provisioner` (or use EFS CSI on AWS) instead of hand-writing the PV.

## Notes

- The image sets `no_root_squash`; combined with `--privileged` this is a demo setup, not production hardening.
- A single EC2 NFS server is a single point of failure and has no replication. AWS EFS or another managed NFS service is the production replacement.
- `persistentVolumeReclaimPolicy: Retain` keeps the data when the PVC is deleted. The PV then goes to `Released`; to reuse it, delete and recreate the PV (or clear `spec.claimRef`).
- Check the node's NFS client package if a Pod hangs in `ContainerCreating`: `kubectl describe pod` will show a mount error if `nfs-common` / `nfs-utils` is missing.

## Cleanup

```bash
kubectl delete -f deployment.yaml
kubectl delete -f pvc.yaml
kubectl delete -f pv.yaml

# On EC2
docker rm -f nfs
```

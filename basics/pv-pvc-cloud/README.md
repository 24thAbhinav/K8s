# PV / PVC with Dynamic Provisioning (Cloud)

Minimal PVC-backed Pod on a cloud provider. The `PersistentVolume` is **not** written by hand — the CSI driver creates it automatically from a `StorageClass`.

```
StorageClass (ebs-gp3)
        │  PVC references it
        ▼
PVC (ebs-pvc) ──► CSI provisioner creates EBS volume + PV (pvc-<uuid>)
        │
        ▼
Pod (ebs-demo) mounts it at /data
```

## Prerequisites

An AWS EKS cluster with the **AWS EBS CSI driver** installed (managed add-on name: `aws-ebs-csi-driver`). The controller needs `AmazonEBSCSIDriverPolicy` permissions — normally via an IAM role for the driver's service account.

For other clouds, only the `provisioner` and `parameters` change:

| Cloud | provisioner | Example parameters |
| ----- | ----------- | ------------------ |
| AWS EBS | `ebs.csi.aws.com` | `type: gp3`, `fsType: ext4` |
| GKE PD | `pd.csi.storage.gke.io` | `type: pd-balanced`, `disk-format: ext4` |
| Azure Disk | `disk.csi.azure.com` | `skuName: StandardSSD_LRS` |

## Apply

```bash
kubectl apply -f storageclass.yaml
kubectl apply -f pvc.yaml
kubectl apply -f pod.yaml
```

Order matters only in that the StorageClass must exist before the PVC is created.

## How the PV appears automatically

1. The PVC asks for 1Gi from `storageClassName: ebs-gp3`.
2. The StorageClass's provisioner (`ebs.csi.aws.com`) sees the pending claim.
3. The CSI controller creates an EBS volume and a matching PV named `pvc-<uuid>`, then binds it to the claim.

```bash
kubectl get storageclass
kubectl get pvc -w
kubectl get pv
```

The PV name is generated, e.g. `pvc-7c1f...`. Inspect the underlying volume ID:

```bash
kubectl get pv <pv-name> -o jsonpath='{.spec.csi.volumeHandle}{"\n"}'
```

`volumeBindingMode: WaitForFirstConsumer` means the PVC stays `Pending` until a Pod is scheduled. That is expected — it lets the volume be created in the same availability zone as the node.

Read the file back:

```bash
kubectl exec ebs-demo -- cat /data/out.txt
```

## Notes

- `ReadWriteOnce` on EBS means the volume is mounted by a single node. For shared read-write across Pods, use EFS (`ReadWriteMany`) instead.
- `reclaimPolicy: Delete` deletes the EBS volume when the PVC is deleted. Use `Retain` if the data must survive.
- `allowVolumeExpansion: true` lets you grow the claim by editing `spec.resources.requests.storage`.
- A StorageClass marked with `storageclass.kubernetes.io/is-default-class: "true"` is used automatically by PVCs that omit `storageClassName`.
- On Kind, the default `standard` StorageClass (local-path) also provisions PVs dynamically, but the backing storage is on the node, not a cloud volume.

## Cleanup

```bash
kubectl delete -f pod.yaml
kubectl delete -f pvc.yaml
kubectl delete -f storageclass.yaml
```

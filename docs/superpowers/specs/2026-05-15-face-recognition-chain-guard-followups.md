# Face Recognition Chain Guard Follow-Ups

## Context

This PR tested a conservative representative-face guard for automatic face/person matching. The goal was to prevent a chain-merge failure mode where locally valid nearest-neighbor matches can grow into a globally bad identity:

```text
A matches B
B matches C
C matches D

=> D becomes attached to A's identity even though D is far from A's representative face.
```

That failure mode is worse than under-merging because it can create a large catch-all person that is hard for users to repair manually.

## What This PR Tried

The implementation kept the existing nearest-match logic, but added a second automatic-merge guard:

- owner-person automatic assignment had to be compatible with the matched person's representative face
- accessible shared identity merges had to be compatible with the target identity representative face
- shared-space member reconciliation had to be compatible with the local person's representative face
- manual face assignment and manual person merging remained unchanged

The guard prevented obvious chain growth, and the unit and medium tests covered the intended true/false/fallback paths.

## Why It Was Not Good Enough

Testing on the personal instance showed the approach was too conservative. After a full Facial Recognition reset, the number of visible people increased substantially and many obvious same-person groups were not merged.

The likely reason is that a single representative face is not a stable enough summary of a real person cluster. Legitimate same-person faces can be far from the current representative because of age, pose, lighting, blur, expression, occlusion, or an imperfect representative choice. Blocking automatic merges solely because the candidate is not close enough to that representative prevents valid cluster growth, especially while a cluster is still being built from scratch.

The result is safer than over-merging, but it creates too much manual merge work.

## Future Approaches To Try

### Centroid Guard

Track or compute a centroid embedding for each identity/person and require candidate faces to be compatible with the centroid, not only with the representative face.

This should be less brittle because the centroid represents the cluster as a whole, while still resisting long chain drift.

### Representative Plus Centroid

Use a layered rule:

```text
candidate may merge if:

1. existing nearest-match logic passes
2. candidate is close enough to the cluster centroid
3. candidate is not extremely far from the representative face
```

The representative check becomes a loose outlier guard instead of the main decision.

### Cluster Radius Limit

Allow the normal nearest-match merge, then reject it if adding the candidate would make the cluster too wide.

Possible checks:

- candidate distance to centroid is below a cap
- candidate distance to representative is below a loose cap
- p90/p95 cluster radius stays below a cap
- max internal distance does not exceed a hard limit

This directly targets the chain-growth failure mode.

### Size-Aware Thresholds

Use stricter automatic merge thresholds as identities get larger:

```text
small identity: allow more variation
medium identity: require centroid agreement
large identity: require strong centroid/representative agreement
```

Large identities should not become gravity wells for weak matches.

### Stronger Evidence For Large Merges

For large identities, require multiple supporting faces or a very strong match before merging another identity/person automatically.

Examples:

- one very close face match
- two or more independent face matches
- centroid agreement plus a nearest-neighbor match

This preserves normal small-cluster growth while making high-impact automatic merges harder.

### Post-Pass Split Detection

After recognition, inspect large or loose identities and split suspicious clusters with a second clustering pass.

This is useful as a repair mechanism, but should not be the only protection. Prevention is still preferable because users see the bad state before repair runs.

## Recommended Next Direction

Do not continue with a representative-only guard.

The next implementation should be tested around cluster-level behavior:

1. same-person variation should still merge even when it is not close to the representative
2. a chain of locally close faces should not create a globally loose identity
3. large identities should require stronger evidence than small identities
4. a full reset should not dramatically increase duplicate people compared with the baseline

The most promising next design is a centroid/radius guard layered on top of the existing nearest-match logic.

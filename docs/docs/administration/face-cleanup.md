# Face Cleanup

## What it is

During the misattribution event, automatic identity merges fused face clusters from different people — some clusters
ended up contaminated with another person's photos. The Face Cleanup console finds these mixed clusters and lets an
admin **re-home** the impostor faces to their true owner.

The affected person keeps all of their real faces, their name, and their thumbnail. This tool is **not** a
person-merge and **never empties a cluster** — it only moves the faces that don't belong.

## When to use it

Gallery's automatic repair handles clusters that are lightly contaminated (under 50% impostor faces). The Face
Cleanup console handles the rest — the "over-cap" clusters where the contamination is high enough to need human
confirmation before anything moves.

If someone's People page shows photos that clearly belong to a different person, run the Face Cleanup console.

## How to use it

1. Go to **Administration → Face cleanup**.
2. Click **Re-scan**. The scan runs while the facial recognition queue is idle; it completes in seconds to minutes
   depending on the number of faces on the instance.
3. Review the table. The scan splits flagged clusters into two groups:
   - **Review these first** (amber rows) — named people, large clusters, or clusters whose impostor faces route
     into another flagged cluster. Open each row to see the faces that would leave vs. the suspected owner. Uncheck
     any faces that actually belong to this person, then click **Move faces** to approve the move for that person.
   - **Confident — auto-selected** — unnamed, small clusters with a single clean owner. These are pre-selected and
     safe to bulk-approve from the list without opening.

4. Once you are happy with the selection, click **Re-attribute selected (N) →** to apply all approved moves in one
   batch.

### Operating order

Clean **owner-first**: start with the people that have the smallest flagged percentage. Rows marked `bad-target`
mean their suspected owner is itself flagged — resolving the owners first turns those rows green in the next scan.

## Unattributable faces

Some contaminating faces have no confident external owner — their embedding does not resemble any other person's
cluster strongly enough to make a safe assignment. These faces are **left as-is on purpose**: moving them to an
arbitrary cluster would create new errors. They appear in the **Unattributable** stat tile and are counted in the
totals, but they are not presented for action.

## Safety

- The scan and the apply step both **refuse to run while facial recognition is active**. If you see a 409 conflict
  message, wait for the recognition queue to drain and try again.
- Applying a repair **assigns the impostor faces directly to their suspected owner** (an admin-confirmed manual
  assignment). The move is immediate and durable — facial recognition will not re-cluster a manually assigned face,
  so the faces cannot drift back to the wrong person. Once an apply succeeds the affected rows leave the list.
- All moves are reversible: open the affected people on the People page (or run a new scan and use the console) to
  move faces back if needed.

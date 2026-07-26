# Face Cleanup

## What it is

During the misattribution event, automatic identity merges fused face clusters from different people — some clusters
ended up contaminated with another person's photos. The Face Cleanup console finds these mixed clusters and lets an
admin **re-home** the impostor faces to their true owner.

The affected person keeps all of their real faces, their name, and their thumbnail. This tool is **not** a
person-merge: by default it only moves the scan-flagged impostor faces and leaves the cluster intact. An admin
can also open the **whole cluster** to add faces the scan missed, or move an entire _unnamed_ cluster into its
owner in one action — see [Seeing the whole cluster](#seeing-the-whole-cluster).

## When to use it

Gallery's automatic repair handles clusters that are lightly contaminated (under 50% impostor faces). The Face
Cleanup console handles the rest — the "over-cap" clusters where the contamination is high enough to need human
confirmation before anything moves.

If someone's People page shows photos that clearly belong to a different person, run the Face Cleanup console.

## Two ways to clean up

**Administration → Face cleanup** opens a chooser with two modes. They write exactly the same records, so a
decision made in either is permanent and is respected by the other — and by every future scan.

|               | **Guided review**                             | **Manual review**                         |
| ------------- | --------------------------------------------- | ----------------------------------------- |
| Starts from   | a scan                                        | a person you pick                         |
| Shows you     | the faces the scan flagged, worst first       | **every** face on that person             |
| Best when     | you want the likeliest mistakes found for you | you already know whose cluster is wrong   |
| Needs a scan? | yes                                           | **no** — it works on a brand-new instance |

Guided review is the rest of this page. Manual review is described under
[Manual review](#manual-review).

Neither mode is "the" way to do it. If you know that a particular person's photos are wrong, going straight to
manual review is faster than scanning the whole library and hunting for them in the results.

:::note
While a scan is running, manual review is unavailable. Applying changes during a scan would conflict with the
snapshot being built, so the chooser disables it until the scan finishes rather than letting you stage a pile of
decisions and lose them.
:::

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

## Seeing the whole cluster

The review page opens on the scan's **suggestions** — the impostor faces the detector flagged. But the scan only
flags the faces it is confident about, and sometimes you want to act on the rest of the cluster too. Below the
suggestions, the **Rest of this cluster** section lists every other face still assigned to the person, loaded a
page at a time (clusters can hold thousands of faces, so the list pages with **Load more** rather than loading
them all at once).

Two extra actions sit on that section:

- **Add individual faces.** Click any face in the Rest section to add it to the move. It goes to the same
  destination already shown on the screen (the cluster's primary suspected owner) — the same place the suggested
  faces are heading. Use **Select all loaded** to add every face currently on screen. The Stays/Moves strip and
  the **Move N faces** button update live to include your picks.
- **Move the entire cluster.** When the unnamed cluster is _entirely_ one person, **Move entire cluster** moves
  _every_ remaining face — suggestions included — to the primary owner in one action. Because this empties the
  cluster, it asks for confirmation first.

### Emptied clusters

Moving an entire **unnamed** cluster into its owner empties it; the now-empty unnamed cluster is **deleted** so no
orphan placeholder is left behind — the result reads like a clean merge into the owner. A **named** person emptied
this way is **kept** (its name is deliberate state) and simply drops off the console.

The destination is always the one owner shown on the screen — there is no per-face destination picker. If the scan
snapshot no longer knows a primary owner for the cluster, the add-faces and move-entire-cluster actions are
disabled (the suggestions can still be applied to their per-face owners as usual).

## Manual review

Manual review lets you audit **any** person without running a scan first.

1. Go to **Administration → Face cleanup** and choose **Manual review**.
2. Pick the owner, then search or browse to the person.
3. The review page lists **every** face on that person — not just suspicious ones.
4. Select the faces that are wrong and apply an action.

The interaction is the same as guided review: select tiles, then apply. The actions differ slightly, because
there is no scan making a suggestion to accept or reject:

| Action             | What it does                                                          |
| ------------------ | --------------------------------------------------------------------- |
| _(default)_        | **Nothing.** Faces you do not touch are left exactly as they are      |
| **Move to person** | reassigns the face to another person in the same owner's library      |
| **Lock**           | records that you verified this face — future scans will never flag it |
| **Unknown person** | a real person you cannot name; parks the face in its own new cluster  |
| **Not a face**     | retires the crop entirely. **This is the only irreversible action**   |
| **Unmark**         | undoes a mark you have not applied yet                                |

**Faces you leave alone are not recorded.** This is deliberate: marking every face you glanced at as
human-verified would stop future scans from ever flagging them, hiding real mistakes later. If you _want_ that
permanence for a particular face, use **Lock** on purpose.

The consequence is that re-auditing the same person later starts from a clean slate.

### Working through a large cluster

The page loads faces in pages, so **Select all** covers the faces currently loaded — the header shows
`showing N of M` so you always know the difference. Marks and selections survive loading more.

To act on an entire cluster without paging through it, use **Move entire cluster**, which is resolved on the
server and requires you to pick a destination.

## Unattributable faces

Some contaminating faces have no confident external owner — their embedding does not resemble any other person's
cluster strongly enough to make a safe assignment. These faces are **left as-is on purpose**: moving them to an
arbitrary cluster would create new errors. They appear in the **Unattributable** stat tile and are counted in the
totals, but they are not presented for action.

## Advanced scan

The **Advanced** button next to Re-scan opens a tuning modal for a single scan run. Three knobs are exposed,
pre-filled with the instance's effective defaults:

- **Match sensitivity** (0.1–1, default = the facial-recognition _maximum distance_ setting, typically 0.5) — how
  close two faces must look to be treated as the same person. Lower = stricter (fewer matches), higher = looser.
- **Minimum faces per person** (≥ 1, default = the facial-recognition _minimum faces_ setting, typically 3) — skip
  people with fewer faces than this.
- **Contamination cap** (0–1, default 0.5) — if more than this share of a person's faces look wrong, the whole
  cluster goes to review-only instead of auto-repairing. Higher = more aggressive auto-repair.

Tuned values apply **to that scan run only** — they are stored with the scan (so the review page and the apply step
compute with the same values), but they are never saved as new defaults. Re-opening the modal always shows the
server defaults again.

## Dismissing false positives

If the scan flags something that is actually correct, you can teach it to stop asking:

- **Dismiss** (list page row action) — dismisses the whole suggestion for that person. It will not reappear in
  future scans unless new evidence shows up (different suspected owners).
- **Decline** (per-face, on a person's review page) — marks an individual face as belonging to the person it is on.
  Declined faces are excluded from future scans and from any apply.

Declined faces and dismissed people are listed under **View declined** (`Administration → Face cleanup → View
declined`), where each entry has an **Undo** action that re-surfaces it in the next scan.

## Safety

- The scan and the apply step both **refuse to run while facial recognition is active**. If you see a 409 conflict
  message, wait for the recognition queue to drain and try again.
- Applying a repair **assigns the impostor faces directly to their suspected owner** (an admin-confirmed manual
  assignment). The move is immediate and durable — facial recognition will not re-cluster a manually assigned face,
  so the faces cannot drift back to the wrong person. Once an apply succeeds the affected rows leave the list.
- All moves are reversible: open the affected people on the People page (or run a new scan and use the console) to
  move faces back if needed.
- A **fully-contaminated cluster** (every face flagged) is always classified _Review these first_ with an
  `over-cap` badge — it can never be bulk-approved via the pre-selection. Approving it from its review page moves
  all of its faces, after which the emptied person is removed by the regular cleanup job.

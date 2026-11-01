# History repo handoff (belt workers)

Keeper's handoff: `E:/AI Programs/HQ/handoffs/history/HANDOFF.md`.

## Blocked

Spec clarification for 2848: `BoundaryInput` has no detailed schema in DESIGN; this
unit requires `label` (researched/estimate/fiction) and `source`, preserving further
canonical JSON fields. Confirm the complete boundary contract before building loaders.

## Record implementation notes (2848)

- Writer/reader use Node built-ins for filesystem access, a necessary exception to
  RULES #3's literal import restriction for the requested file-backed API.
- Manifest shape is RunHeader plus `hashes: { filename: fnv1a64(text) }` for the four
  record files. APIs are synchronous; the future observer must catch writer errors
  and call `fail(reason)` as DESIGN 4.1 requires. `fail` itself never performs I/O.
- Score fields allow null for unavailable measurements; ensemble sign consistency
  is a count (DESIGN 7). Payload selection and byte limits belong to the observer;
  the record accepts exactly one of payload or payload_hash.

# Phase 4.3 — Immutable releases and approvals

An immutable release captures the complete financial-master snapshot and policy schedule. Its **release revision** is distinct from each **formula implementation version**: approval, dates or confidence governance may change without inventing a new executable formula version. New formulas still require new code and binding tests.

The core validates publication, copies/freezes records, hashes canonical content with SHA-256, links parent IDs/hashes, rejects overlapping inclusive policy intervals and returns explicit date gaps. A new release may replace a schedule retrospectively without editing an older release. Changed confirmed policy records require fresh approval or demotion to provisional. Changed confirmed financial rates must return to draft before publication. Financial-master structural errors block publication; incomplete setups may be captured for audit but do not establish complete cost coverage.

Approval records are named, timestamped and evidence-linked **self-declarations**, not authenticated signatures. Hashes detect accidental or uncoordinated changes; an attacker with full archive access can rewrite and rehash it. This is not tamper-proof storage.

Pinned calculations retain exact source fingerprint, release ID/hash, policy interval key, request evidence and result. Verification replays the exact implementation and compares the result. A new analysis must be created explicitly to use a newer release. Input source references and master-rate matching are still responsibilities of later financial engines; pinning does not prove that supplied rates came from the master.

Tests cover snapshot isolation, approval succession, integrity failure, broken lineage, overlap/date gaps, retroactive releases and old-run reproduction. No UI or durable persistence is added in this checkpoint; those follow in 4.4–4.5.

User authorized local commits for 4.3–4.5 in one run, with separate stacked branches. Pushes, PR creation and merges remain user-owned.

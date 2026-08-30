# Phase 4.4 — Confidence and policy interface

Adds **Policies & history** as a secondary workspace, keeping import/setup and future financial results simple. The interface creates explicit provisional policies, revises schedules, records named self-declared approval in a new release, checks date coverage and reviews earlier release snapshots. It captures the current Financial Setup draft without mutating it. Conflicting dates require correction; missing financial setup does not become complete merely because a release is captured.

No confidence thresholds are prefilled. The user provides versioned high/medium/low label boundaries and a provisional/assumption cap; these describe policy rules, not overrides of calculated result scores. The interface displays the actual formula and its guards. It does not allow arbitrary formula text to execute.

`evaluateWithConfidence` computes each amount's evidence score from validated input coverage, evidence-backed source/mapping/formula-reliability assessments, and policy/input caps. The weakest component caps the total. Labels are High, Medium, Low and Very low; unknown evidence or missing mandatory inputs return Unavailable, not a fictitious score. A score is evidence, not probability. Estimated/provisional inputs without an applicable versioned confidence rule cannot receive a score. Quality hard-stop rules are evaluated only when assessments exist.

Assessments must be produced by later data-quality/matching engines with evidence references and methods. This module validates their contracts; it cannot independently prove their accuracy. The current dashboard does not expose a score override or fabricated monetary results. Core confidence calculation is available for later engine integration.

Unit/component tests cover critical caps, missing evidence, estimated inputs, hard quality rules, blank setup, release publication, approval succession and disabled approval of unsaved edits. The existing app preview is reused locally. No hosting or branding changes are made.

Checkpoint verification on Node 22.19.0: lint/typecheck/build passed; 259 tests passed, one optional real-workbook test skipped. Tests exercise the rendered components; this is not independent cross-browser or visual certification.

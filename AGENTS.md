# AdapTab project guidance

Before planning or implementing AdapTab, read:

- `docs/PRODUCT_PLAN.md` for the canonical product and architecture decisions.
- `docs/REQUIREMENTS_STATUS.md` for the original requirements, current gaps,
  and ordered development milestones.
- `docs/EXPERIMENT_LOG.md` for behavior verified in real browsers.

AdapTab is a new hackathon product. Showrun is prior work and may be used as a
reference or library, but it is not the hackathon entry and should not be
presented as AdapTab.

Keep the hosted catalog, browser activation bridge, and injected target-page
runtime as separate trust boundaries. Do not claim the hosted page can inject
into another origin by itself.

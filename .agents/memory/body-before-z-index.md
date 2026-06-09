---
name: KUDASAI body::before z-index trap
description: body::before is position:fixed;z-index:0 — any section lacking position renders behind it and becomes invisible
---

## The Rule
Any element that needs to be visible on a page using this CSS must have `position: relative; z-index: 1` (or higher) to render above the ambient `body::before` overlay.

**Why:** `body::before` is `position: fixed; inset: 0; z-index: 0` — it covers the entire viewport as the ambient background. Non-positioned elements (position: static) in normal flow paint BEHIND positioned elements with z-index ≥ 0. So static hero/section elements are invisible under the overlay.

**How to apply:** Whenever adding a new page section or standalone page that doesn't use `backdrop-filter` (which auto-creates a stacking context), add `position: relative; z-index: 1` to the outermost container of that section. The `.legal-hero` fix was the canonical example.

Elements that work without this fix (because they already create stacking contexts):
- `.legal-header` — has `position: sticky; z-index: 100`
- `.legal-card` — has `backdrop-filter: blur(10px)` which creates a stacking context

---
name: Splash double-render fix
description: Why the landing page KUDASAI title appeared twice on load, and how to prevent it
---

## The Rule
`.landing-content` must have `animation-delay: ~0.95s` (currently `animation: landingIn 0.65s var(--transition) 0.95s both`) so the landing content stays invisible while the splash fades out.

**Why:** When no session exists, `hideSplash()` is called — it adds class `splash-out` which triggers a `0.6s opacity` transition. During that fade, the landing page behind the splash becomes visible through the decreasing opacity. Both the splash wordmark AND the landing `h1.landing-title` say "KUDASAI" + "The Social Platform of the Future", causing a double-render ghost effect. The `animation-fill-mode: both` means `opacity:0` is held until the delay expires, keeping landing content hidden during splash fade.

**How to apply:** If the splash timing ever changes (currently: 280ms pre-delay + 600ms transition = ~880ms total), update the animation-delay accordingly. Keep it at least 50ms longer than the total splash dismissal time.

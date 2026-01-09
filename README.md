# treeplum

Static, mobile-first modern-art scroll experience for **Tree Plum** inspired by **fluidity** (fluid motion).

## Run locally

- **Option A (simple)**: open `index.html` directly in a browser.
- **Option B (recommended)**: run a tiny local server from this folder:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Notes

- Optimized for **Mobile Safari**: capped DPR, `requestAnimationFrame` scheduling, passive scroll listeners.
- Respects **reduced motion** (`prefers-reduced-motion`).

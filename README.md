# Royal Imperial — Zareqia Invitation Template

A self-contained static build of the **Royal Imperial** invitation template
(template id: `rose-gold-blush-royal`) from zareqia.com, including all code and
assets, with the demo watermark (dove logo + "Zareqia" text) and demo CTA/popup
buttons removed.

## Run it

Needs any static file server. Easiest, using the included server (Node.js):

```bash
node serve.js
# then open http://localhost:3000/  → it redirects to the Royal Imperial demo
```

Or with plain Python (no SPA fallback needed since files are pre-placed):

```bash
python3 -m http.server 8000
# open http://localhost:8000/invite/demo/?template=rose-gold-blush-royal&type=wedding
```

Internet access is still required at runtime for: Google Fonts, and the live
demo data (names, date, venue…) which the app fetches from the project's public
Supabase endpoint. All code and media below are local.

## Structure

```
├── index.html                     App shell (+ baked-in UI overrides & root redirect)
├── invite/demo/index.html         Same shell, so the /invite/demo route works on plain static hosts
├── favicon.png
├── assets/                        The full compiled app (JS + CSS bundles, 443 files)
│   ├── index-CUUdvKla.js          Entry bundle
│   ├── InvitationPage-*.js        Invitation page (template router)
│   ├── useTemplateDesign-*.js     Template design system
│   └── …                          Vendor + lazy page chunks
├── __l5e/assets-v1/               Media (original URL paths preserved)
│   ├── 2d33888a-…/demo-refined-royal-imperial.mp4   Hero video — watermark-FREE clean render ✨
│   ├── f10c2f57-…/royal-imperial.mp4                Same clean video (production path)
│   ├── bfbd7dce-…/Royal_Imperial.webp               Template poster
│   ├── a62cfc14-…/slide-1.jpg … 757602f2-…/slide-4.jpg   Slideshow photos
│   ├── 40ff04bb-…/track1.mp3 · 5b633d59-…/track2.mp3 · d58c0b7f-…/track3.mp3  Music (demo plays track3)
│   ├── 046df47e-…/zareqia-demo-watermark.png        Neutralized → 1×1 transparent pixel
│   └── 3fcf3274-…/zara-assistant-dove.png           App loader logo
├── overrides-royal-imperial.html  The CSS overrides (also baked into index.html)
└── serve.js                       Small static server w/ SPA fallback, live-proxy & Range support
```

## What's customized vs. the original site

1. **Hero video has no burned-in watermark** — the demo file was swapped for the
   clean production render (identical 10 s cinematic, verified frame-by-frame).
2. **Demo watermark overlay, the "create yours" CTA pill, and the feedback
   popup are hidden** via a small `<style>` block baked into `index.html`
   (source in `overrides-royal-imperial.html`; the app code itself is untouched).
3. The watermark PNG itself is reduced to a 1×1 transparent pixel.

Everything else — template code, layout, animations, music, slideshow, fonts —
is exactly the original build.

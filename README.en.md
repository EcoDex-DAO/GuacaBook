# GuacaBook

A local-first photo collection and annotation app for macaw owners. Available in **English, French, Spanish and Portuguese**. The language selector is available on the welcome page and throughout the app. The browser language is used initially (English fallback); an explicit choice is remembered on the device. No translation service or API is used, and photos and names are never sent for translation.

Optional Supabase email accounts and private cloud storage are now supported; see the [setup guide](docs/SUPABASE.md) for SQL, email/SMTP and Vercel settings. No privileged key is used by the browser.

## Run locally

Use Node.js 24 (`.nvmrc`) and npm 11:

```sh
npm ci --no-audit --no-fund
npm run dev
```

Open localhost on port 3000. No API keys or environment variables are required for the local demo. Supabase mode requires the two public settings in `.env.example`. For production, run `npm run build` then `npm start`.

Checks: `npm test`, `npm run typecheck`, `npm run build`. With the server running: `npm run smoke` and `node tests/i18n-browser.mjs`. Browser tests use system Chromium (`CHROMIUM_PATH` to override) and `TEST_BASE_URL` if required.

## Contribute

1. In Supabase mode, sign in with an email code, then choose a nickname. Without Supabase configuration, the nickname is only a local demo profile.
2. Add your macaws, then choose an animal and upload a photo batch.
3. Perform each task across the whole batch: quality, viewpoint, visible body, eyes, periocular regions, then review.
4. Use the illustrated cards to declare anatomical sides. The animal’s left is on the right of an unmirrored front-view photo. For both eyes, draw a separate left and right box; repeat for periocular regions. Unknown information must remain unknown.
5. Use zoom, pan and fit-to-screen to annotate details. You can reset the current step or one side without deleting other categories.
6. Explicitly authorize photo use under **CC BY 4.0**, including redistribution and commercial use with attribution, then export the ZIP.

Photos and drafts stay in IndexedDB in the current browser and origin. They are not automatically uploaded. Signed-in users can explicitly save and load a private cloud collection, submit it with recorded consent, and voluntarily transfer a previous local draft. Draft caches are isolated per account; concurrent cloud saves use revision checks. Export regularly before clearing site data. Changing the interface language does not translate animal names, species, sessions or filenames, and does not reset annotations or consent.

## Export

The ZIP includes unchanged originals, a COCO JSON and an English format note. Inspect originals for private metadata before sharing; the app does not extract GPS, but originals may still contain it.

Standard COCO categories retain stable IDs: `macaw` (1), `periocular_region` (2), `eye` (3). Bounding boxes are `[x, y, width, height]` in original pixels **after EXIF orientation**, regardless of display zoom. Apply the EXIF orientation before using boxes on originals. Standard IDs, keys and category names do not change with the interface language.

`images[].guacabook` contains stable `photo_id`, `individual_id`, `batch_id`, `session_id`, `quality`, `viewpoint`, `body_visibility`, `eye_visible`, `eye_layout`, `periocular_by_side`, `annotation_status` and sanitized original filename. `annotations[].guacabook` contains individual identity and anatomical `side` (`left`, `right`, `unknown`, or null for body boxes). Top-level `guacabook` includes contributor nickname, individuals, sessions and an empty future crops list. Missing information is null or explicitly unknown; drafts are included and labelled `draft`.

Viewpoint angles are contributor-selected approximations: front 0°, right 90°, back 180°, left 270°, with intermediate 45° positions; elevation +30°, 0° or −30°. The procedural 3D model is a provisional visual reference, not an anatomical measurement or validated identification method.

## Scope and development

Dataset is available; Identification and Digital twin are placeholders. Email accounts and private centralized storage are optional with Supabase. No AI, COCO import or crops yet. Large collections are limited by browser storage and ZIP memory. Reliable individual identification remains to be evaluated.

Translation catalogs are in `lib/i18n/{en,es,pt}.json`, with French source keys. Update every catalog when adding text; use named placeholders rather than translating contributor data. Language codes and COCO vocabulary are kept separate. Regional browser settings such as `pt-BR` and `es-MX` use the Portuguese and Spanish catalogs. These are initial general translations; review scientific terminology with native-speaking contributors before a large recruitment campaign.

See [README.md](README.md) for the full French format reference. SeaTurtleID2022 is not bundled; verify its license and structure separately before use.

# GuacaBook V1

The current version is shown in the app footer and comes from `package.json` · [Version policy](docs/VERSIONS.md).

V0 is archived at tag `v0.0.0`, branch `release/v0` (commit `ae6eb15`). V1 adds generic research data and a MiewID CSV adapter. Apply migration 004 for protected annotation review; see [the V1 specification](docs/V1_DATASET.md).

A centralized photo collection and annotation app for macaw owners. Available in **English, French, Spanish and Portuguese**. The language selector is available on the welcome page and throughout the app. The browser language is used initially (English fallback); an explicit choice is remembered on the device. No translation service or API is used, and photos and names are never sent for translation.

Supabase invitation-based email/password accounts and private cloud storage are required; see the [setup guide](docs/SUPABASE.md) for SQL, email/SMTP and Vercel settings. No privileged key is used by the browser.

## Run locally

Use Node.js 24 (`.nvmrc`) and npm 11:

```sh
npm ci --no-audit --no-fund
npm run dev
```

Open localhost on port 3000 after filling the two public settings from `.env.example` in an ignored `.env.local` file. There is no local demo or offline editor. Without configuration, an unavailable-project message is shown. For production, run `npm run build` then `npm start`.

Checks: `npm test`, `npm run typecheck`, `npm run build`. With the server running: `npm run smoke` and `node tests/i18n-browser.mjs`. Browser tests use system Chromium (`CHROMIUM_PATH` to override) and `TEST_BASE_URL` if required.

## Contribute

1. Accept an administrator’s invitation, choose a password, then sign in with email and password and accept the research participation agreement and choose a nickname. Your account collection is loaded automatically.
2. Add your macaws, then choose an animal and upload a photo batch.
3. Perform each task across the whole batch: quality, viewpoint, visible body, eyes, periocular regions, then review.
4. Use the illustrated cards to declare anatomical sides. The animal’s left is on the right of an unmirrored front-view photo. For both eyes, draw a separate left and right box; repeat for periocular regions. Unknown information must remain unknown.
5. Use zoom, pan and fit-to-screen to annotate details. You can reset the current step or one side without deleting other categories.
6. The initial agreement covers research contributions under **CC BY 4.0**. Record region sharpness and occlusion; authorized reviewers decide which regions can enter the Wild Me CSV.

Animals, photos, annotations and progress are loaded from and saved automatically to Supabase. Saves are serialized and revision-checked; edits made during a transfer are queued. Nothing is persisted as a new photo/draft cache in IndexedDB. Authentication and language preferences remain in browser storage. Historic caches are neither read nor silently deleted; collections already uploaded are restored automatically.

Pending changes live only in memory. On a save failure, keep the page open, retry, or download a recovery ZIP before reloading. Signing out waits for pending saves. Conflicts never silently overwrite another device’s work. Changing interface language does not alter dataset values or trigger a data reset.

## Export

V1 archives contain unchanged uploaded originals, EXIF-normalized lossless images,
COCO boxes (schema 3), traceable periocular crops grouped by identity/anatomical side,
and generic metadata CSVs. The MiewID CSV includes only completed, sharp, unobstructed,
identified regions accepted for the exact source collection revision. Generic data
retains unknowns and, for personal exports, drafts. Closed and identity-disjoint open
splits group images, exact duplicates, sessions and days before partitioning. Small
cohorts do not receive fabricated evaluation sets. The exported Python helper resolves
paths and prepares per-split CSVs. See [the format and limitations](docs/V1_DATASET.md).

## Scope and development

Dataset is available; Identification and Digital twin are placeholders. Supabase accounts and centralized storage are required. No identification model, segmentation or COCO import is implemented. Large collections are limited by project quotas and browser memory, including ZIP creation. Reliable individual identification remains to be evaluated.

Translation catalogs are in `lib/i18n/{en,es,pt}.json`, with French source keys. Update every catalog when adding text; use named placeholders rather than translating contributor data. Language codes and COCO vocabulary are kept separate. Regional browser settings such as `pt-BR` and `es-MX` use the Portuguese and Spanish catalogs. These are initial general translations; review scientific terminology with native-speaking contributors before a large recruitment campaign.

See [README.md](README.md) for the full French format reference. SeaTurtleID2022 is not bundled; verify its license and structure separately before use.

## Account administration

Apply migration `002_account_management.sql` after migration 001. A confirmed Auth user `ecodexdao@gmail.com` must exist first; this UUID becomes the protected initial administrator. New Auth users start inactive and cannot self-assign roles through user metadata. Administrators can manage account types, invite users and suspend accounts. Contributors only access their own collection; reviewers may review contributions without managing accounts.

Invitation links require a **private server-only** `SUPABASE_SECRET_KEY` in Vercel. Never prefix it with `NEXT_PUBLIC_`. The server validates the caller’s JWT and current database permissions before using privileged Auth operations. Configure `/auth/invite` and `/auth/recover` redirect URLs, disable public signup, then redeploy. Password setup and recovery are handled by Supabase Auth. See [the setup guide](docs/ACCOUNT_MANAGEMENT.md). Tests use simulated APIs and do not send real emails.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Release version policy

The V0 baseline is immutable at tag v0.0.0 and branch release/v0 (ae6eb15).
Continue V1 work on main. Never move or overwrite published release tags.
Before each code delivery, update package.json and package-lock.json together using
`npm run version:patch`, `version:minor` or `version:major` as appropriate.
Corrections use patch, compatible new features use minor, incompatible data/API
changes use major. During a beta, patch increments the beta counter. Display the
version through lib/version.ts; do not hardcode it in UI or export metadata.
Use conventional commits (fix:, feat:, or feat!: / BREAKING CHANGE:) so the GitHub
version workflow can classify a delivery that omitted an explicit version bump.
Only remove the beta suffix and tag a stable release after validation.

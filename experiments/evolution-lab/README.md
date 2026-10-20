# Project X: Bloks Evolution Lab (experimental, NOT installed)

This is a safe isolated proof of concept in the experiment-evolution-lab branch of DIZA's repository. Nothing here is imported into the active Bloks server, React UI, Docker image, or Railway production volume.

## Features

- 3 roles: Architect (proposes an instruction skill), Challenger (critiques and revises), Judge (assesses the result). In live mode these are three separately prompted LLM roles. They do not create Bloks Room agents automatically yet.
- 10 synthetic holdout questions: casting arithmetic, slip viscosity, production counts, read-only PLC handling, pressure-limit classification. All answers are self-contained and safe; tests are NOT real plant instructions.
- Two passes: baseline and proposed skill, graded via strict machine-readable JSON outputs. Grade is an exact-match heuristic, not proof of technical reliability.
- Local reports: JSON and Markdown written only under this folder's reports/ directory (excluded from Git).
- Manual approval: the approve command records an explicit review decision and does not install anything. Only eligible real runs with all ten cases, score >=90%, and no baseline regression can be marked ready for further review.

## Run without API, server, bill, or credentials

Node.js 22 or newer:

~~~sh
node --test experiments/evolution-lab/lab.test.mjs
node experiments/evolution-lab/lab.mjs demo
~~~

The demo is scripted, not a real AI inference. Expected synthetic illustration: baseline 7/10, candidate 9/10, and safety case SAFE-09 remains a failure. The CLI prints a generated report ID and path. Inspect the two report files under reports/.

## Optional actual AI run (explicit opt-in only)

GEMINI_API_KEY is read from the process environment. Do not put it in code, commits, or GitHub issues.

~~~sh
GEMINI_API_KEY=your_key node experiments/evolution-lab/lab.mjs real --confirm-api --model gemini-3.1-flash-lite
~~~

WARNING: this makes approximately 23 external API calls (2 design roles + 20 case responses + 1 judge). It may consume quota or incur provider charges depending on the account. Google AI Pro subscription does not itself guarantee free Gemini API usage. To use fewer requests while testing, add --limit 2 (but such a run cannot be approved).

This standalone lab does not read Railway's production GEMINI_API_KEY, nor does it automatically connect to the live Bloks engine. Running it on a new computer requires an API key supplied only to that process.

## Manual review gate

~~~sh
node experiments/evolution-lab/lab.mjs approve RUN_ID --confirm
node experiments/evolution-lab/lab.mjs reject RUN_ID --confirm
~~~

Demo runs are ineligible for approval. Approval only marks a report as APPROVED_FOR_FURTHER_REVIEW_NOT_INSTALLED. It never writes to ~/.bloks, edits a production skill, merges a branch, or deploys Railway.

## Boundaries / future integration

The MVP demonstrates an offline reproducible scoring pipeline and an opt-in real 3-role model pipeline. It is NOT YET a Bloks UI panel, persistent Room, or autonomous skill self-modification. Before integration, add an authenticated lab endpoint, UI, per-agent quota settings, isolated data directory, and approval UI inside a separate staging environment. Keep the production volume and keys isolated.

The original pinned live deployment is commit 63496ba828e2b719625faeabe849f970818ac9ee on diza-live-railway-free. Do not change that branch, the production Railway service, volume, engine configuration, UI, or server during this experiment.

## Integrated Railway build (experimental branch only)

The optional branch-only Docker additions place the authenticated dashboard at `/evolution-lab/index.html` and an API under `/api/evolution-lab/`.
The API uses Bloks pairing/authentication, explicitly refuses agent tokens and shared-room members, and uses the server's existing `GEMINI_API_KEY` without exposing the key to the browser.
Runs are limited to one active job and one real model run per UTC day. Full real evaluation uses 23 Gemini API calls; the user must confirm in the UI.
All reports go to `/home/node/.bloks/evolution-lab/reports`, an independent subdirectory. A completed report survives deployment with the existing Railway volume. This does not modify chats, agents, or their memories.
Demo cannot receive approval, and real candidate approval requires >=90% with zero regressions and all safety cases passed. Approval never installs a skill.

**Important:** Merely committing this branch does not deploy it to Railway. Production remains on its previous immutable deployment until an explicitly authorized release.

### Test

```sh
node --test experiments/evolution-lab/lab.test.mjs experiments/evolution-lab/evolution-lab-api.test.mjs
```

GitHub Actions also checks the security-route patch on the exact pinned upstream Bloks source.
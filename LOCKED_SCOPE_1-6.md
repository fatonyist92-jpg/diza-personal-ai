# Diza Bot Agent — MASTER LOCK 1-6

Status: MASTER LOCKED
Branch: diza-bot-agent-dev-123

This document locks the current architecture and behavior of Items 1 through 6.
Items 1-3 remain defined by:
- diza-android/LOCKED_SCOPE_1-2-3.md

Items 4-6 remain defined by:
- diza-core-456/LOCKED_SCOPE_4-5-6.md

## Change-control rule

No behavior, schema, routing rule, memory rule, task rule, quota rule, background-worker rule, source-scope rule, or storage policy inside Items 1-6 may be changed unless Fatony explicitly requests that change.

New features must be added as a new layer/item and must not silently rewrite Items 1-6.

Bug fixes are allowed only when they preserve the locked behavior.

Do not:
- publish backend changes without explicit instruction
- build or release a new APK without explicit instruction
- replace provider policy with a paid route
- weaken Rp0 safeguards
- merge private bot memory automatically
- enable autonomous bot-to-bot collaboration without a user-created task
- broaden chat/group source visibility beyond its locked scope
- silently enable newly discovered AI providers
- silently change file-size or storage policy
- silently alter daily/48-hour provider maintenance cadence

## Item 1 — Bot Identity

Locked UI contract after Fatony's explicit request:
- Chats home follows the approved dark DIZA inbox reference
- bottom navigation: Chats / Agents / Groups / Settings
- top + menu: New Bot / New Group Chat
- Create/Edit Bot flow: avatar, name, title, Bot Mark, Instructions, Model, Tools, Memory, Routines
- Instructions includes Quick Prompts
- Bot Profile Preview is shown before save
- custom bot deletion is available; default Diza remains protected
- group definitions select explicit bot members and collaboration begins only from a user-sent group task

Locked:
- custom bot name
- title
- avatar
- instructions
- response style/personality
- skills
- permissions
- default bot protection
- provider-independent bot identity

## Item 2 — Memory

Locked UI/behavior addition after Fatony's explicit request:
- Memory settings expose Long-term Memory, Save Preferences, and Project Context
- Long-term Memory off prevents that bot's private memory from being injected into native chat/task context
- Project Context off prevents shared workspace memory from being injected
- Clear Memory removes only that bot's private memory from the mobile profile flow

Locked:
- conversation history
- private per-bot long-term memory
- per-bot task memory
- shared workspace memory
- private bot memory is not automatically shared with other bots
- files remain separate from memory records and are referenced by metadata/storage references

## Item 3 — Task Orchestrator

Locked UI addition after Fatony's explicit request:
- Groups use the existing task orchestrator for user-assigned multi-bot collaboration
- task list/detail remains accessible from Settings
- group member order defines the task step order

Locked:
- user-created task is required for bot-to-bot work
- user controls participants and step order
- later steps may receive earlier assigned outputs
- bots cannot invent additional collaboration outside the task graph
- task state remains bounded and auditable

## Attachments, Sources, and Storage

Locked:
- maximum target upload size: 50 MB per file
- no artificial Diza Bot Agent total-storage cap at this stage
- actual provider/storage capacity remains an external infrastructure limit
- files are stored separately from core memory
- large sources should be retrieved selectively rather than injected in full every turn

Source scopes:
- Main source: available across chats/bots/tasks
- Chat source: restricted to that conversation
- Group source: reserved for that group when group chat is implemented

Attachments/source menu:
- Choose File
- Take Photo
- Attach Image
- Add Source

## Item 4 — Free AI Mesh Router

Locked:
- dynamic provider routing
- capability matching
- quota/health/reliability-aware scoring
- automatic bounded failover
- stable idempotency
- provider attempts count against task budget
- bot identity/memory/source/task state stay outside model providers
- paid routing is not allowed by default

Provider/account safety gates stay enforced.

## Item 5 — Quota Calendar + Rp0 Lock

Locked:
- FREE ONLY routing policy
- paid_allowed = false
- auto top-up = false
- auto upgrade = false
- application spend target = Rp0
- default safety reserve = 10%
- simultaneous quota windows supported, including requests/day and tokens/minute

Provider maintenance:
- free-tier check: first runtime tick after 00:00 WIB every day
- provider discovery: every 48 hours
- official provider information is authoritative for activation decisions
- public catalogs are discovery radar only
- discovered providers are never silently enabled

## Item 6 — Background Task Engine

Locked:
- no user task = no user-agent background work
- provider maintenance is a separate user-authorized system routine
- persistent task state
- persistent quota state
- persistent idempotency state
- restart recovery
- worker leases
- wait-for-quota and resume
- bounded retry
- provider-call budget
- active-runtime budget
- user cancellation
- no infinite bot loops

## Current validation state

The Item 4-6 durability suite passed 34/34 tests in CI before this master lock was created.

Standalone commands:
- npm run worker
- npm run maintenance
- npm run maintenance:force
- npm run status
- npm test

## Known pending production integration

These do NOT change the lock:
- backend server-side upload limit still needs to be aligned to 50 MB
- Items 1-3 and 4-6 still need production backend/database integration
- provider onboarding/API-key UI is not yet built
- provider dashboard UI is not yet built
- APK integration/release has not been performed

## Future features

Any future capability should be introduced as Item 7 or later unless Fatony explicitly requests modification of Items 1-6.

Items 1-6 are the frozen foundation.

# Diza Bot Agent — Locked Scope 4-5-6

Status: LOCKED CORE
Branch: diza-bot-agent-dev-123
Do not publish backend or build/release APK unless Fatony explicitly asks.

## 4. Free AI Mesh Router

Locked behavior:
- Bot identity, memory, source, and task state stay outside AI providers.
- Routing is dynamic, not a fixed fallback chain.
- Provider choice uses capability fit, quota health, reliability, latency, context fit, privacy fit, and recent failures.
- Automatic failover is allowed for quota, timeout, network, server, auth, and provider-availability failures.
- Stable request idempotency prevents duplicate AI calls after worker crash/restart.
- Provider attempts are bounded by the task budget.
- Paid routes are not allowed.

Supported adapter families:
- OpenAI-compatible
- Gemini
- Cloudflare Workers AI
- Cohere trial/evaluation

Current direct provider templates:
- Groq
- Gemini
- Mistral
- Cloudflare Workers AI
- Cerebras reserve/trial
- NVIDIA NIM developer reserve
- Cohere trial/evaluation reserve

OpenRouter:
- monitored as market/free-tier intelligence only
- excluded from default live routing because current terms conflict with the intended competing multi-provider service architecture

## 5. Quota Calendar + Rp0 Lock

Hard rules:
- billing mode = FREE ONLY
- paid_allowed = false
- automatic top-up = false
- automatic upgrade = false
- app spend target = Rp0
- default quota safety reserve = 10%

Quota engine supports simultaneous windows:
- minute
- hour
- day
- week
- month
- trial/credit-style state

A provider/model may have more than one active limit at once, for example:
- requests/day
- tokens/minute

Authoritative provider headers override estimates when available.

### Free-tier maintenance — LOCKED

Daily provider check:
- scheduled at the first runtime tick after 00:00 WIB every day
- official provider documentation is checked
- free-tier facts and page fingerprint are stored
- changes create provider-intel events
- unsafe providers can be safety-disabled before they are used again

Provider discovery:
- runs every 48 hours
- multiple public free-LLM catalogs are used as radar/lead sources
- machine-readable JSON feeds are supported
- new candidates are compared with known providers
- official pages are checked before a candidate receives verified_free status
- compatible base URLs may be captured for future generic adapter setup
- discovered providers are NEVER silently enabled into live routing

Provider activation still requires:
- supported adapter
- API key/credentials
- free-tier/account confirmation when applicable
- policy/terms compatibility
- zero-spend safety

## 6. Background Task Engine

Locked rules:
- no user task = no user-agent background work
- scheduled provider maintenance is a separate explicitly authorized system routine
- user chooses task participants and step order
- earlier step results may be passed into later assigned steps
- bots cannot invent extra collaboration outside the task graph

Task states:
- queued
- running
- waiting_for_quota
- completed
- failed
- cancelled

Durability:
- task state persists across worker restart
- idempotency state persists across worker restart
- quota state persists across worker restart
- worker leases protect against duplicate execution
- tasks may wait until free quota resets and then resume
- permanent provider failures use bounded retry and then fail
- user cancellation stops queued work
- active runtime budget is enforced
- actual provider failover attempts count against provider-call budget

Default task safety:
- max provider calls is bounded
- max active runtime is bounded
- step retry count is bounded
- no infinite bot loop

## Runtime commands

- npm run worker
- npm run maintenance
- npm run maintenance:force
- npm run status
- npm test

The standalone worker can run outside Floot. Production hosting may later use Floot for API/auth/database while keeping the 4-5-6 worker as a separate long-running service.

## Account safety gates

These must be explicitly confirmed before live routing:
- GROQ_FREE_PLAN_CONFIRMED=true
- GEMINI_FREE_TIER_CONFIRMED=true
- MISTRAL_FREE_MODE_CONFIRMED=true
- CLOUDFLARE_FREE_PLAN_CONFIRMED=true

Trial/development providers also require explicit opt-in:
- DIZA_ENABLE_CEREBRAS_TRIAL=true + confirmation
- DIZA_ENABLE_NVIDIA_DEV=true + confirmation
- DIZA_ENABLE_COHERE_TRIAL=true + confirmation

## Test status

Core test coverage includes:
- dynamic routing
- Rp0 lock
- failover
- daily/weekly reset
- multi-window quota
- idempotency
- crash recovery
- persistent state
- quota wait/resume
- provider discovery
- daily 00:00 WIB maintenance logic
- 48-hour discovery cadence
- Cloudflare free-plan safeguards
- provider account gates
- task cancellation
- provider-call budget
- active-runtime budget

Latest durability suite target: all tests must be green before production integration.

## Explicitly not done yet

These remain separate from the locked 4-5-6 core:
- publish/integrate 4-5-6 into Floot backend
- migrate persistent file state to production database tables
- push notifications
- APK integration/release
- provider API-key onboarding UI
- provider dashboard UI
- source/memory semantic retrieval optimization

Those require separate explicit implementation steps and must not silently alter the locked 4-5-6 behavior.

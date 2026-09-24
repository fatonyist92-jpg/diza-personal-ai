# Diza Core 4-5-6

Standalone provider-routing and background-work runtime for Diza Bot Agent.

## Item 4: Free AI Mesh Router

Implemented:
- capability-aware dynamic routing
- quota/health-aware provider scoring
- automatic failover
- request idempotency
- generic OpenAI-compatible adapter
- Gemini adapter
- provider factory from environment variables
- live provider refresh after free-tier maintenance

Directly supported provider templates:
- Groq
- Gemini
- Cerebras
- OpenRouter
- Mistral
- NVIDIA NIM

Other providers remain monitored/discovered until a tested adapter is available.

## Item 5: Quota Calendar + Rp0 Lock

Implemented:
- request/token/credit quota ledger
- 10% safety reserve
- recurring quota windows
- cooldowns and health penalties
- persistent quota state
- hard free-only provider policy
- official-doc free-tier watcher
- automatic provider safety disable when monitored terms stop looking free
- provider discovery routine

### Schedule

Daily free-tier check:
- first run after 00:00 WIB every day
- checks official provider documentation
- fingerprints pages and extracts structured free-tier facts
- records change events

New provider discovery:
- every 48 hours
- public free-LLM catalogs are used only as lead generators
- unknown providers become candidates
- candidates are not enabled automatically
- official free-tier verification and a supported adapter/key are required before routing traffic

This is intentionally conservative. A discovery feed cannot silently add a provider to live routing.

## Item 6: Background Task Engine

Implemented:
- queued/running/waiting/completed/failed/cancelled task states
- ordered multi-bot steps
- previous-step result passing
- worker claim leases
- bounded retries
- wait-for-quota and resume
- persistent task store
- persistent idempotency store
- runtime restart recovery
- maintenance scheduler separated from user-agent work

Rule:
- no user task means no user-agent background work
- the midnight free-tier check and 48-hour discovery are explicit user-authorized system maintenance routines

## Zero-spend policy

Cloud providers instantiated by the factory are forced to:
- billingMode = free_only
- paidAllowed = false

If monitored provider terms become unsafe, the provider can be removed from the live routing pool on the next refresh.

## Environment keys

- GROQ_API_KEY / GROQ_MODEL
- GEMINI_API_KEY / GEMINI_MODEL
- CEREBRAS_API_KEY / CEREBRAS_MODEL
- OPENROUTER_API_KEY / OPENROUTER_MODEL
- MISTRAL_API_KEY / MISTRAL_MODEL
- NVIDIA_API_KEY / NVIDIA_MODEL

No key is stored in the APK by this core.

## Standalone assembly

Use createDizaSystem() from system.mjs. It wires:
catalog -> intel monitor -> maintenance scheduler -> quota ledger -> provider factory -> mesh router -> persistent task engine -> runtime.

State is stored under .diza-state by default. A production DB adapter can replace the file stores later without changing routing/task semantics.

## Tests

Run:

    npm test

Tests use mock providers and mock web sources, so they do not consume real provider quota.

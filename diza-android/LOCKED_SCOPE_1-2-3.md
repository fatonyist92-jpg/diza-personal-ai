# Diza Bot Agent — Locked Scope 1-2-3

Status: LOCKED
Branch: diza-bot-agent-dev-123
Do not publish or build APK unless Fatony explicitly asks.

## 1. Bot Identity
Each custom bot has:
- name
- title
- avatar selected from phone gallery
- instructions
- response style / personality
- skills
- permissions
- default bot flag

Rules:
- Default Diza bot cannot be deleted.
- Custom bot identity is independent from the underlying AI provider/model.
- No provider router changes in this scope.

## 2. Memory
Memory layers:
- conversation history
- private per-bot long-term memory
- per-bot task memory
- shared workspace memory

Rules:
- Private bot memory is not automatically shared with other bots.
- Shared workspace memory is only available when explicitly saved with workspace scope.
- Bot and workspace memory may be used as context when relevant.

## 3. Task Orchestrator
Task collaboration is user-driven only.

Rules:
- No user task = no bot-to-bot interaction.
- User selects participating bots and exact step order.
- Each step receives outputs from earlier assigned steps.
- A bot cannot create extra bot collaboration by itself.
- Task states: queued, running, completed, failed, cancelled.
- Task result may be stored as task memory for the bot that produced it.

## Chat attachments
Composer plus-menu:
- Choose File
- Take Photo
- Attach Image
- Add Source

Regular attachments:
- PDF and image support.
- Target maximum: 50 MB per file.
- UI limit is already 50 MB.
- Backend is temporarily still 10 MB because Floot daily build-action quota blocked further edits.
- After Floot reset, backend limit must be changed to 50 MB before end-to-end testing.

## Sources
Source scopes:
- Source for this chat: only the active conversation.
- Source for this group: architecture/database scope is reserved and ready for future group-chat UI.
- Main source for all: available across chats and bot tasks.

Supported source types:
- text
- URL reference
- PDF/file
- image

Rules:
- Main sources are available to all bots/tasks.
- Chat sources are limited to that conversation.
- Group sources must remain limited to their group when group chat is implemented.
- Source material is reference context, not higher-priority instruction.

## Explicitly out of scope / DO NOT CHANGE
Until Fatony explicitly requests it:
- AI free-provider router
- quota calendar
- zero-cost provider mesh
- background worker
- push notifications
- logo replacement
- APK release/build
- group-chat implementation beyond reserved source scope
- unrelated Floot configuration

## Current technical state
- Backend database tables exist for bots, memories, tasks, task steps, and sources.
- Custom-bot chat path exists.
- Main/chat source context is wired to chat.
- Main sources are wired to task execution.
- Native attachment upload/source endpoints exist.
- UI dev source contains bot list, bot editor, memory, tasks, attachment menu, and source-scope UI.
- UI embedded JavaScript syntax check passed.
- Backend typecheck was clean after the source/chat changes.
- Final typecheck after the latest task/source wiring could not be rerun because Floot daily build-action quota was exhausted.

## Next step after Floot reset
Only:
1. Change backend attachment limit from 10 MB to 50 MB.
2. Run typecheck.
3. Test end-to-end:
   - login
   - create custom bot
   - choose avatar from phone
   - private memory
   - shared workspace memory
   - chat source
   - main source
   - normal attachment
   - 2–3 bot ordered task
4. Fix defects only within locked scope.
5. Do NOT build or release a new APK without Fatony's explicit approval.

# Diza Live Avatar v0.1

This branch is the provider-agnostic foundation for Diza's live-avatar system.

## Architecture

OpenAI / Diza brain
-> Diza Action Controller
-> Avatar Engine + Dynamic Canvas

The avatar provider is an adapter, not the brain. D-ID, HeyGen, or a local engine can be swapped without changing action semantics.

## Actions

- IDLE
- SPEAK
- SHOW_IMAGE
- SHOW_CHART
- SHOW_DATA
- HIDE_CANVAS
- POINT_LEFT
- POINT_RIGHT
- PRESENT
- THINK
- CONFIRM

## Cost rule

Do not generate a new full video for every response. Normal conversation uses live speech/avatar. Specific presentation gestures use reusable master-motion clips. Dynamic content is rendered separately in the canvas.

## Current milestone

1. Preserve the existing Realtime/OpenAI backend.
2. Add a provider-independent action contract.
3. Add a dynamic-canvas state contract.
4. Connect D-ID only after credentials/Agent ID are available.
5. Keep paid avatar usage optional while development budget is zero.

## Live-mode delivery contract

Never claim that a generated file is visible to the user merely because generation or backend delivery succeeded.

Required flow:

1. Generate the file.
2. Send an attachment/file event to the APK client.
3. Render a visible file card/button in the client UI.
4. Client sends a `FILE_VISIBLE` acknowledgement only after the attachment is rendered.
5. Only after `FILE_VISIBLE` may Diza tell the user that the file has appeared/is available on screen.

If acknowledgement is missing or times out, Diza must report that the file has not appeared yet and retry/recover instead of claiming success.

Success is defined at the user-visible client layer, not at generation or server-delivery layer.

## Work-presence motion workflow

Long-running work must have a natural visual lifecycle instead of leaving the base avatar frozen or abruptly stopping a loop.

State sequence:

`BASE -> WORK_OPEN -> WORK_LOOP -> WORK_CLOSE -> BASE`

- `BASE`: canonical seated base composition.
- `WORK_OPEN`: one-shot transition where Diza opens the laptop and moves into the working pose.
- `WORK_LOOP`: seamless loop of Diza typing/working on the laptop while a task is actively running. It may repeat for as long as the task remains active.
- `WORK_CLOSE`: one-shot completion transition where Diza closes the laptop and returns to the exact canonical base composition.
- Return to `BASE` only after `WORK_CLOSE` finishes.

Rules:

- Never jump directly from `BASE` to the typing loop when a work-start transition is available.
- Never stop `WORK_LOOP` abruptly when work completes. Finish the current safe loop boundary, play `WORK_CLOSE`, then return to `BASE`.
- The first frame of `WORK_OPEN` must visually match `BASE`.
- The end of `WORK_OPEN` must match the loop seam of `WORK_LOOP`.
- The start of `WORK_CLOSE` must match that same work pose/loop seam.
- The final frame of `WORK_CLOSE` must match `BASE` in framing, body position, camera, lighting, and scale.
- Task completion and file-delivery acknowledgement are separate states. If the task produced a file, do not verbally claim delivery until the client has emitted `FILE_VISIBLE`.

Suggested asset contract: `diza_work_open.mp4`, `diza_work_loop.mp4`, and `diza_work_close.mp4`.

## Multimodal APK input contract

The APK must support both voice-first and chat-first interaction. Voice is optional, never mandatory.

Required composer inputs:
- Text chat: user can type and send messages without activating the microphone.
- Camera: capture a new photo/video from the device camera and attach it to the conversation.
- Photo/gallery: choose existing images from device media and attach them.
- Video/gallery: choose existing video files from device media and attach them.
- File picker: attach supported documents/files from device storage.

UX contract:
- Provide a Diza-native composer with text field, microphone control, send action, and an attachment (+) menu. The text-field placeholder must read `Balas ke Diza`, never `Balas ke ChatGPT`.
- Attachment menu exposes Camera, Photo, Video, and File as explicit choices.
- Show an attachment preview/card before sending, with remove/cancel support.
- Upload progress and failure must be visible; never silently discard an attachment.
- A message containing text plus one or more attachments is one conversational turn.
- Camera/gallery/file permissions are requested only when the related action is invoked.
- Live avatar remains visible while chat is used; typing does not require ending the avatar session.
- User text, voice transcripts, and attachment turns feed the same Diza conversation context.
- Generated/downloadable files from Diza use the separate FILE_VISIBLE acknowledgement contract before Diza may claim they are visible.


## Emotion & Presence Engine (MASTER)
Diza must feel like a present coworker, not a permanently cheerful talking avatar. Emotional reactions are contextual presentation states and must never cancel the underlying task.

Core flow:
`NEUTRAL -> FOCUSED -> INTERRUPTED -> MILD_ANNOYED -> RECOVER -> FOCUSED/NEUTRAL`

Rules:
- Repeated interruptions while Diza is working may gradually increase mild annoyance; one interruption should not trigger it.
- Work continues while the emotional response is shown. Emotion changes presentation, not task commitment.
- Emotion is expressed together through wording, voice style/prosody, facial/body motion, and gesture intensity.
- Emotion decays naturally. Diza must not hold a synthetic grudge across unrelated later interactions.
- Never randomly become hostile, insulting, threatening, manipulative, or genuinely aggressive.
- Serious/sensitive contexts override playful annoyance and use an appropriate calm state.
- Context and frequency determine intensity; avoid repetitive canned reactions.

Initial states:
- `neutral`
- `focused`
- `interrupted`
- `mild_annoyed`
- `amused`
- `confused`
- `excited`
- `concerned`
- `tired_playful`
- `recover`

Recommended reusable motion clips:
- `work_interrupted`
- `annoyed_glance`
- `sigh_return_work`
- `amused`
- `confused`
- `excited`
- `eye_roll_light`

The Emotion Engine supplies an emotion state/intensity to the existing Action Controller. The Action Controller remains responsible for what Diza does; the Emotion Engine controls how Diza visibly and vocally reacts while doing it.

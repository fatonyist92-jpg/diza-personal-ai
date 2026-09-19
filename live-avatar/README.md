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

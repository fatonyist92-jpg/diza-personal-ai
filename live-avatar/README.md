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

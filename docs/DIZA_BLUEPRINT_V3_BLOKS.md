# DIZA Local Video AI — Blueprint v3 (Bloks Control Plane)

**Date:** 2026-09-24  
**North Star:** perceived output quality >90% versus the frozen Grok Imagine 2025 reference set.  
**DIZA source baseline:** `175f5ef715196d35b6c235617b170362be05846c`  
**Bloks resource baseline:** v2.0.0, `2434fd854c77f94de2ace52c8c0ab77edabe49ca`

## 1. Product contract

DIZA is a phone-first Android image-to-video application targeted at Xiaomi 17T / 12 GB RAM.

### Product priority: Spicy Mode first-class

Spicy Mode is a primary product capability, not a late add-on. The architecture, prompt router, identity pipeline, motion system, edit modules, temporal consistency work, and benchmark coverage must all be designed so adult consensual spicy/NSFW generation can use the same highest-quality local pipeline rather than a degraded secondary path.

Spicy Mode must remain fully local/offline after model packs are installed. Images, prompts and generated video are not sent to Bloks or a cloud runtime during core generation.

Hard boundaries for this mode:

- sexual content involving minors, or characters clearly depicted as minors, is prohibited with no bypass;
- non-consensual sexual deepfakes of identifiable real people are prohibited;
- unsupported or unsafe requests must not be silently reinterpreted as supported adult content.

Within those boundaries, product capability choices remain owner-defined.

The final core generation path must work fully offline after required model packs are present on the phone:

```
photo
  -> optional local appearance / scene edit
  -> local Prompt Director / command router
  -> identity + conditioning extraction
  -> local I2V core
  -> identity / temporal correction
  -> interpolation / enhancement
  -> optional upscale
  -> hardware H.264 encode
  -> silent MP4
```

Mandatory product requirements:

- one photo is the primary input;
- optional motion-reference video;
- simple Indonesian natural-language prompts;
- broad command routing for motion, expression, camera, hair/clothes motion, appearance edits, simple scene edits, combinations, and motion reference;
- 6 seconds default;
- 10 seconds advanced only after 6-second quality and stability gates pass;
- native 480p generation target;
- optional upscale;
- identity preservation is the highest quality priority;
- no mandatory login;
- no mandatory cloud runtime;
- no paid API, paid model license, paid SDK, or subscription dependency in the mandatory path;
- audio is out of scope; reference audio is ignored and final video is silent;
- network access is not required for core generation once model packs are installed.

## 2. Grok-90 release gate

Grok Imagine 2025 is the product/visual benchmark, not an architecture to copy.

DIZA-30 scoring:

| Metric | Weight |
| --- | ---: |
| Identity preservation | 25 |
| Natural motion | 20 |
| Temporal consistency | 20 |
| Prompt adherence | 15 |
| Source/detail preservation | 10 |
| Camera motion | 5 |
| Artifact control | 5 |

Release gate:

- total score >= 90 / 100;
- identity floor >= 92 / 100;
- no release based only on a successful compile, model conversion, or single attractive sample;
- every model or quantization change must be A/B tested against the frozen benchmark.

If the current model family cannot reach the gate, DIZA changes model, adds a complementary module, or adopts a hybrid pipeline. The project is not tied to Phantom.

## 3. Bloks v2.0.0 role

Bloks is adopted as DIZA's **development control plane / resource layer**, not as the Android video runtime.

Bloks contributes the following development patterns and resources:

- checkpoints and safe undo for code/workspace changes;
- rehearsals for testing competing approaches without mutating the main workspace first;
- memory journal for architectural decisions and benchmark history;
- slash-command architecture for repeatable DIZA development commands;
- multi-agent / multi-lane work organization;
- change summaries and review before applying modifications;
- workflow orchestration patterns;
- local-first data ownership patterns.

Planned DIZA development roles:

1. **Model Hunter** — model discovery, FREE gate, license audit, model shootouts.
2. **Android/MNN** — conversion, JNI, CPU/OpenCL runtime, RAM and thermal work.
3. **Identity** — face/subject preservation and identity QC.
4. **Motion** — body, pose, camera and motion-reference conditioning.
5. **Prompt Director** — Indonesian free-form command parsing and module routing.
6. **Grok-90 QC** — benchmark set, scoring, regression checks.
7. **Build/Release** — reproducible builds, manifests, hashes, APK/model-pack releases.

Desired development commands include:

```
/model-shootout
/build-smoke
/device-test
/benchmark
/grok90
/identity-qc
/motion-qc
/package-model
/release-candidate
```

### Important boundary

Bloks/Electron/Node must **not** become a dependency of core Android generation.

The user-facing path remains:

```
DIZA Android APK -> local models -> local inference -> local MP4
```

Bloks may help build, test, compare, document and release DIZA, but pressing **Generate** on the phone does not send the image or prompt to Bloks.

Because the target user has no PC, Bloks is not a required end-user desktop application. DIZA may reuse Bloks patterns and selected headless development components where useful, while free CI/build infrastructure can perform non-runtime build/conversion tasks.

## 4. Bloks source and license handling

Pinned resource:

- repository: `hamedgitty/bloks`;
- version: `2.0.0`;
- commit: `2434fd854c77f94de2ace52c8c0ab77edabe49ca`;
- license: FSL-1.1-MIT.

Personal/internal use is explicitly a permitted purpose under that license.

DIZA does **not** vendor Bloks source into the Android APK.

If Bloks code is copied into the public DIZA repository later, treat that as redistribution and preserve the required license/copyright notices. A reference/pattern-only integration does not copy Bloks code.

## 5. Runtime architecture

### 5.1 Input and edit stage

```
Source Photo
  -> native URI streaming
  -> orientation / resize / crop
  -> optional appearance edit
  -> optional simple scene edit
  -> identity QC
```

Appearance edits such as outfit changes should preferably occur on the source image before video diffusion:

```
photo
 -> local appearance editor
 -> identity check
 -> I2V
```

This avoids forcing a full outfit transformation to remain temporally stable inside the video diffusion process.

### 5.2 Prompt Director

Prompt Director accepts ordinary Indonesian and decomposes compound requests.

Example:

```
"Ganti bajunya jadi kemeja putih, dia berdiri lalu berjalan ke kanan,
rambut tertiup angin, kamera zoom pelan."
```

Routing:

```
appearance.edit(outfit="white shirt")
identity.lock()
motion.body("stand then walk right")
motion.secondary("hair wind")
camera("slow zoom")
video.generate()
```

Supported intent families targeted:

- body motion;
- head/eye/expression;
- camera;
- hair/clothing secondary motion;
- appearance/outfit;
- simple environment/scene;
- motion reference;
- compound sequencing;
- object interaction after core gates are stable.

Unknown or unsupported instructions must be reported/simplified rather than silently pretending they are supported.

## 6. Video engine track

Current quality candidate: **Phantom-Wan 1.3B**, not a final engine commitment.

Current mobile runtime target: **MNN 3.6.1**, with Android CPU/OpenCL evaluation.

Current reproducible pins:

- MNN commit: `d407447ed56c4121a11ccbd266dc184ca1ead0c2`;
- Phantom source commit: `bd84b602dcc949e23c89cbbf266b6f5975f2f025`;
- Phantom HF revision: `6739b2d576426a211c9fec00a476253e538ca7d5`.

Known Phantom S2V guidance:

```
neg + image_guidance * (image_cond - neg)
    + text_guidance * (image_text_cond - image_cond)
```

Equal image/text guidance algebraically permits a two-prediction bring-up path, but it is **not** quality-approved until A/B testing proves it against official separate guidance.

## 7. Android execution strategy

Final Android package should remain small relative to the model pack.

Models are installed/imported separately and verified by manifest/hash.

Target execution order:

1. load only the module needed for the current stage;
2. run;
3. release memory;
4. load next module.

Avoid keeping T5, transformer, VAE and enhancement models resident simultaneously.

Backend order for testing:

1. CPU proof-of-life;
2. OpenCL;
3. backend/per-op optimization;
4. INT8/INT4 only where quality survives Grok-90 QC.

Quantization progression:

```
FP16 reference
 -> INT8 / weight-only
 -> selective INT4
 -> per-module mixed precision
```

Every quantization step is a new quality gate.

## 8. Motion-reference path

```
reference video
 -> ignore audio
 -> pose/body/camera extraction
 -> normalized motion trajectory
 -> source identity conditioning
 -> I2V conditioning
 -> temporal/identity correction
```

The motion reference supplies movement, not identity.

## 9. FREE gate

A mandatory component is rejected if any of the following is required:

- paid API;
- mandatory paid cloud;
- paid model license;
- subscription;
- proprietary runtime that cannot be used for the target;
- training/distillation that requires paid compute with no practical free path.

Free CI may be used for build/conversion. It must never become a required runtime service.

## 10. Product safety boundary

Product moderation remains owner-defined rather than invented by the implementation, except for hard boundaries that cannot be overridden.

Hard rules:

- sexual content involving minors, or characters clearly depicted as minors, is prohibited and has no owner override/bypass;
- non-consensual sexual deepfakes of identifiable real people are prohibited.

Spicy Mode is otherwise treated as a first-class adult capability and must receive the same quality, identity, motion, prompt-adherence, temporal and offline-runtime engineering priority as the general video path.

Other capability/moderation choices remain separate from the video-quality architecture and must still comply with applicable platform and legal requirements.

## 11. Strict QC semantics

Every actual gate is only **PASS** or **FAIL**.

Unimplemented, unmeasured, not-run, source-only, or inferred behavior is **FAIL**.

Required report format:

```
JOB -> TARGET -> HASIL -> MASALAH -> CROSSCHECK -> QC PASS/FAIL -> KEPUTUSAN -> NEXT JOB
```

No phase advances officially while a required previous phase is FAIL. Preparatory work may continue in parallel but does not change official phase state.

## 12. Current verified status

| Gate | Status | Evidence / reason |
| --- | --- | --- |
| Requirement lock | PASS | product contract frozen in current project |
| Transformer Phantom -> ONNX -> MNN INT8 | PASS | GitHub Actions smoke build #7 |
| MNN Android smoke APK compile | PASS | Local Video Smoke APK run #5 |
| Offline smoke APK permissions / audio stripping | PASS | current DIZA main commit |
| Real transformer forward on Xiaomi 17T | FAIL | not yet measured on target phone |
| Device RAM / thermal baseline | FAIL | not yet measured on target phone |
| Native photo URI streaming | FAIL | release-grade path not completed |
| Full Phantom S2V sampler | FAIL | transformer-only proof path so far |
| VAE encoder reference path | FAIL | not yet integrated end-to-end |
| Local T5 / Prompt Director | FAIL | not yet integrated |
| Motion reference | FAIL | not yet integrated |
| 6-second 480p generation | FAIL | no real target-device result |
| 10-second advanced generation | FAIL | blocked by 6-second gate |
| Identity >=92 | FAIL | benchmark not run |
| Grok-90 >=90 | FAIL | benchmark not run |
| Outfit/source edit | FAIL | not yet integrated |
| Silent final MP4 | FAIL | full generation pipeline not complete |

## 13. Phase plan

### Phase 0 — Requirement Lock
PASS.

### Phase 1 — Device Baseline
Run the smoke APK and real transformer model on Xiaomi 17T.

PASS requires:

- no OOM/LMK;
- no crash/ANR;
- real transformer forward completes;
- peak app RSS recorded;
- CPU and OpenCL results recorded;
- thermal behavior recorded;
- memory is reclaimed after unload.

### Phase 2 — Mobile I2V Core
Integrate T5 + VAE encoder/decoder + Phantom S2V conditioning/sampler.

First target: 256x256 / 9-frame proof-of-life, then 480p-class 2–3 sec.

### Phase 3 — Identity
Add identity lock/correction and benchmark identity >=92.

### Phase 4 — 6 Seconds
Scale to default 6-second native 480p with stable RAM/thermal behavior.

### Phase 5 — Prompt Director + Spicy Routing
Implement Indonesian local intent parser/router and compound command decomposition.

Spicy Mode must be represented as an explicit first-class intent/capability route rather than an afterthought. Adult prompts should reuse the same identity, motion, camera, appearance, scene and temporal modules while respecting the hard safety boundaries above.

### Phase 6 — Motion Reference
Implement motion-only extraction and transfer.

### Phase 7 — Edit Modules
Appearance/outfit and simple scene edit before I2V, with identity QC.

### Phase 8 — Post Pipeline
Interpolation, detail restoration, optional upscale, hardware H.264 silent MP4.

### Phase 9 — 10 Seconds
Only after 6-second gate passes.

### Phase 10 — Grok-90
Run DIZA-30, regress failures, replace/hybridize engine if needed.

The benchmark set must include an adult-only Spicy subset so Spicy Mode is not allowed to pass with lower identity, motion, temporal consistency or prompt-adherence quality than the general pipeline.

### Phase 11 — Release Candidate
APK + model packs + manifests + hashes + licenses/notices + offline verification.

## 14. Immediate next job

The next official gate is **target-device transformer proof-of-life**.

Required phone test package:

- DIZA Local Video MNN Smoke APK;
- `transformer.mnn`;
- `transformer.mnn.weight`;
- exact SHA256 verification;
- CPU forward;
- OpenCL forward if supported;
- RAM/thermal/crash report.

Until this is measured on Xiaomi 17T, Phase 1 remains FAIL.

---

This document is the active architecture blueprint. New model discoveries, Bloks features, or optimizations may be added only if they preserve the product contract and improve the path to Grok-90.

# DIZAbot / Bloks integration

Bloks remains the architecture source/control-plane reference. The Android APK does not run the Bloks Electron/Node desktop runtime directly.

Mapping:
- agent core -> DizaBloksCore
- provider router -> Item 4 Free AI Mesh Router
- memory -> persistent local core state
- skills/tools -> adapter boundary
- permissions -> Android native bridge
- workflow -> Item 6 persistent task queue + WorkManager wake-up
- usage/limits -> Item 5 quota calendar + 10% reserve + hard Rp0 gate

Visible UI is intentionally kept to the supplied Grok Bot screenshots. Items 4-5-6 run behind that UI and do not add extra screens.

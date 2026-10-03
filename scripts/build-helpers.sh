#!/usr/bin/env bash
#
# Builds the two native macOS helpers as universal binaries.
#
# The app ships a universal .app, but swiftc defaults to the host
# architecture, so a straight `swiftc helper.swift` on an Apple Silicon
# machine produces an arm64-only helper that gets copied into the Intel
# slice too. Dictation and the screen-recording prompt then fail on Intel
# with nothing in the log except a failed spawn. Building each slice and
# lipo-ing them together is the fix.
#
# macOS 11 is the floor because that is what Electron 43 requires, and
# both helpers use APIs from 10.15 or earlier.
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "The helpers are macOS-only; nothing to build on $(uname -s)." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
out=electron/resources
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for helper in speech-helper perm-helper auth-helper; do
  # The speech helper hears the Mac's own sound for meeting notes through
  # ScreenCaptureKit, which exists from macOS 12.3. Linked weakly, so the
  # helper still starts on 11 and simply goes without it there.
  extra=()
  if [ "$helper" = speech-helper ]; then extra=(-Xlinker -weak_framework -Xlinker ScreenCaptureKit); fi
  for arch in arm64 x86_64; do
    swiftc -O \
      -target "$arch-apple-macos11.0" \
      ${extra[@]+"${extra[@]}"} \
      "$out/$helper.swift" \
      -o "$tmp/$helper.$arch"
  done
  lipo -create -output "$out/$helper" "$tmp/$helper.arm64" "$tmp/$helper.x86_64"
  chmod +x "$out/$helper"
  echo "built $out/$helper ($(lipo -archs "$out/$helper"))"
done

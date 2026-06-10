#!/usr/bin/env bash
export PATH="$USERPROFILE/.cargo/bin:$USERPROFILE/scoop/apps/mingw/current/bin:$USERPROFILE/scoop/shims:$PATH"
export CARGO_TARGET_DIR="$HOME/dev/target"
export RUST_BACKTRACE=1

cd "$(dirname "$0")"
npm run tauri build 2>&1 | tee build-release.log

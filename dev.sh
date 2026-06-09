#!/usr/bin/env bash
# Inicia o servidor de desenvolvimento Tauri a partir do Git Bash.
# Resolve o problema de windres com espaços no caminho do projeto.

export PATH="$USERPROFILE/.cargo/bin:$USERPROFILE/scoop/apps/mingw/current/bin:$USERPROFILE/scoop/shims:$PATH"
export CARGO_TARGET_DIR="$HOME/dev/target"

cd "$(dirname "$0")"
npm run tauri dev

# Inicia o servidor de desenvolvimento Tauri.
# Resolve o problema de espaços no caminho movendo o diretório de build.

$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:USERPROFILE\scoop\apps\mingw\current\bin;$env:USERPROFILE\scoop\shims;" + $env:PATH
$env:CARGO_TARGET_DIR = "$env:USERPROFILE\dev\target"

Set-Location $PSScriptRoot
npm run tauri dev

#!/usr/bin/env bash
# 初始化共享 CloakBrowser 环境（默认 ~/cloak-env）
# 用法: CLOAK_ENV=~/cloak-env scripts/setup-cloak-env.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLOAK_ENV="${CLOAK_ENV:-$HOME/cloak-env}"
mkdir -p "$CLOAK_ENV/bin"
cp "$ROOT/deploy/fhs.nix" "$CLOAK_ENV/fhs.nix"
cp "$ROOT/deploy/cloak-run" "$CLOAK_ENV/bin/cloak-run"
cp "$ROOT/deploy/cloak-env-info" "$CLOAK_ENV/bin/cloak-env-info"
chmod +x "$CLOAK_ENV/bin/cloak-run" "$CLOAK_ENV/bin/cloak-env-info"
if [ ! -f "$CLOAK_ENV/package.json" ]; then
  cat > "$CLOAK_ENV/package.json" <<'JSON'
{
  "name": "cloak-env",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "cloakbrowser": "0.6.5",
    "playwright-core": "1.65.0"
  }
}
JSON
fi
cd "$CLOAK_ENV"
npm install --no-audit --no-fund
if command -v nix >/dev/null 2>&1; then
  NIXPKGS_ALLOW_UNFREE=1 nix build --impure --expr 'import '"$CLOAK_ENV"'/fhs.nix' -o "$CLOAK_ENV/cloak-fhs"
else
  echo "[setup] 未检测到 nix；非 NixOS 可跳过 FHS，直接使用 cloak-run（需系统已安装 Chromium 运行库）" >&2
fi
"$CLOAK_ENV/bin/cloak-env-info"
echo "[setup] done: $CLOAK_ENV"

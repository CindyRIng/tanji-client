# deploy

共享 CloakBrowser 环境所需的构建与启动文件。

| 文件 | 用途 |
| --- | --- |
| `fhs.nix` | NixOS FHS 环境（Node 22 + Chromium 依赖） |
| `cloak-run` | 通用包装：进入 FHS 后在当前目录执行命令；非 NixOS 直接执行 |
| `cloak-env-info` | 输出 cloak-env 路径与依赖版本 |

## 初始化

```bash
CLOAK_ENV=$HOME/cloak-env scripts/setup-cloak-env.sh
```

或手动：

```bash
mkdir -p ~/cloak-env/bin
cp deploy/fhs.nix ~/cloak-env/fhs.nix
cp deploy/cloak-run ~/cloak-env/bin/cloak-run
cp deploy/cloak-env-info ~/cloak-env/bin/cloak-env-info
chmod +x ~/cloak-env/bin/cloak-run ~/cloak-env/bin/cloak-env-info

cd ~/cloak-env
cat > package.json <<'JSON'
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
npm install
NIXPKGS_ALLOW_UNFREE=1 nix build --impure --expr 'import ~/cloak-env/fhs.nix' -o ~/cloak-env/cloak-fhs
```

## 说明

- cloakbrowser 0.6.5 是 0.6 线最后一个 keyless 版本；Chromium 146。
- 升级 0.7.x 需要 license key（免费 key 1 并发），且 0.7.2 起 `playwright-core` 需 `<1.65`。
- Chromium 下载缓存默认在 `~/.cloakbrowser`，可跨项目共享。
- profile、缓存、token 必须按项目/账号隔离。
- 详细配置见 [docs/09-configuration.md](../docs/09-configuration.md)。

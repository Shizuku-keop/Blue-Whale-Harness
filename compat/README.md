# DSH 兼容矩阵注册表（compat.json）

插件 × DSH 版本的机器可读兼容数据——货架上的"保质期标签"。

- **数据来源**：CI 矩阵与人工实测登记。矩阵工具（`compat-matrix.yml` 模板、`local-matrix.ps1`、`seed-compat.mjs`）维护在 [`Shizuku-keop/dsh-compat-guard`](https://github.com/Shizuku-keop/dsh-compat-guard) 的 `compat/` 目录。
- **消费方**：`dsh-compat-guard preflight`（升级闸门的插件兼容与存储格式检查）、shields.io 徽章。
- **schema**：见同目录 `schema.json`（以此目录为权威，`dsh-compat-guard` 内的副本与之同步）。
- **维护工作流**：`.github/workflows/compat-validate.yml` 在 PR 改动 `compat/` 时自动校验（`node compat/validate.mjs`，零依赖），未通过不可合并；也可 `workflow_dispatch` 手动跑。
- **离线兜底**：`dsh-guard` 客户端缓存 24h，断网时用本地 `lib/formats.json` + 插件 `dsh.compat` 元数据降级。

## 徽章示例（shields.io dynamic JSON）

```
https://img.shields.io/badge/dynamic/json?url=<json url>&query=$.plugins["<plugin>"]["<dsh-ver>"].status&label=dsh%20compat
```

具体（jsDelivr + URL 编码）：

```
https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fcdn.jsdelivr.net%2Fgh%2Fleenkcool%2FBlue-Whale-Harness%40main%2Fcompat%2Fcompat.json&query=%24.plugins%5B%22dsh-better-sidebar%22%5D%5B%220.1.1-rc.2%22%5D.status&label=dsh%20compat
```

status 取值：`pass`（绿）/ `fail`（红）/ `unknown`（灰）。

## 登记方法

1. **插件作者**：package.json 声明 `dsh.compat`（`node compat/seed-compat.mjs <目录>` 一键生成，工具在 dsh-compat-guard），并接入 CI 矩阵（`compat-matrix.yml` 模板）。
2. **本地快速验证**：`powershell -File <dsh-compat-guard>/compat/local-matrix.ps1 -Versions <ver> -Plugins <pkg>`，把输出行并入 `compat.json` 的 `plugins.<pkg>.<ver>`。
3. **存储格式事实**：换 DSH 版本时先实测（`dsh-guard status` 的 fingerprint），登记进 `storageFormats`。

## PR 提交检查清单

- 只改 `compat/`（含本 README）与 `.github/workflows/compat-validate.yml`，不要顺带改 `catalog/`、`repos.*`、根 README 等无关文件。
- 提交前本地跑一遍：`node compat/validate.mjs compat/compat.json compat/schema.json`（退出 0 才通过）。
- `plugins.<pkg>` 键按字母序排列，便于 review diff；新增 DSH 版本时同步补 `dshVersions` 与 `storageFormats` 条目。

# DSH 兼容矩阵注册表（compat.json）

插件 × DSH 版本的机器可读兼容数据——货架上的"保质期标签"。

- **数据来源**：CI 矩阵（`compat-matrix.yml`，各插件仓库或本地 `local-matrix.ps1` 跑出）与人工实测登记。
- **消费方**：`dsh-compat-guard preflight`（升级闸门的插件兼容与存储格式检查）、shields.io 徽章。
- **schema**：见同目录 `schema.json`（与 `dsh-compat-guard/compat/schema.json` 同步）。
- **离线兜底**：`dsh-guard` 客户端缓存 24h，断网时用本地 `lib/formats.json` + 插件 `dsh.compat` 元数据降级。

## 徽章示例（shields.io dynamic JSON）

```
https://img.shields.io/badge/dynamic/json?url=<raw compat.json>&query=$.plugins["<plugin>"]["<dsh-ver>"].status&label=dsh%20compat
```

具体（raw URL 编码）：

```
https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FShizuku-keop%2FBlue-Whale-Harness%2Fmain%2Fcompat%2Fcompat.json&query=%24.plugins%5B%22dsh-better-sidebar%22%5D%5B%220.1.1-rc.2%22%5D.status&label=dsh%20compat
```

status 取值：`pass`（绿）/ `fail`（红）/ `unknown`（灰）。

## 登记方法

1. **插件作者**：package.json 声明 `dsh.compat`（`node compat/seed-compat.mjs <目录>` 一键生成），并接入 CI 矩阵（`compat-matrix.yml`）。
2. **本地快速验证**：`powershell -File <dsh-compat-guard>/compat/local-matrix.ps1 -Versions <ver> -Plugins <pkg>`，把输出行并入 `compat.json` 的 `plugins.<pkg>.<ver>`。
3. **存储格式事实**：换 DSH 版本时先实测（`dsh-guard status` 的 fingerprint），登记进 `storageFormats`。

# [Bug & Fix] 极简模式下 persistent bash 每次执行卡顿 3.5s+ 的根本原因与修复方案（附 Fork 分支）

### 1. 现象
在 `dsh` 中使用 **极简模式（minimal preset）** 时，任何极简单命令（如 `pwd`、`ls`）每次执行均固定耗时 **3500ms ~ 3800ms**，首条命令耗时高达 **~7200ms**。

---

### 2. 根本原因

1. **Prompt 协议握手不一致**：
   - 底层 `@deepseek-ai/dsh-terminal-bash` (`packages/terminal/terminal-bash/src/sanitize.ts`) 中预设的提示符是：
     ```typescript
     export const CONTROLLED_PROMPT = 'dsh> '
     ```
   - 但上层 `@deepseek-ai/dsh-tool-bash-persistent` 在初始化 Persistent Shell 时，实际注入的 `PS1` 是：
     ```typescript
     const SHELL_PROMPT = '__DSH_PERSISTENT_BASH_PROMPT__ '
     ```
   - 导致底层 `TerminalSanitizer` 收到命令结束的 OSC 转义标记后，无法匹配到预期的提示符，`promptTextSeen` 始终为 `false`，导致 **50ms 的快速返回通道完全失效**。

2. **兜底推断超时（Inferred Idle）**：
   - 快速通道失效后，底层退化为等待终端完全静默：`idleSilenceMs (3000ms) + handoffGraceMs (500ms) = 3500ms`。
   - 首条命令因为经历了 Shell 初始化（3.5s）+ 正式命令（3.5s），总耗时为 ~7.2 秒。

---

### 3. 已验证的修复方案

已在源码中将底层的 `CONTROLLED_PROMPT` 统一修改为持久化终端实际使用的提示符，并实测验证通过：
👉 **修复分支**：https://github.com/ManTouMT/deepseek-harness/tree/fix/persistent-bash-prompt-timeout

**修改文件**：
`packages/terminal/terminal-bash/src/sanitize.ts`:
```diff
- export const CONTROLLED_PROMPT = 'dsh> '
+ export const CONTROLLED_PROMPT = '__DSH_PERSISTENT_BASH_PROMPT__ '
```

### 4.测试截图
之前：
<img width="1408" height="719" alt="image" src="https://github.com/user-attachments/assets/53422646-dad7-4eb8-b809-66f766240c66" />

之后：
<img width="1323" height="775" alt="image" src="https://github.com/user-attachments/assets/30ea601c-4fa5-433d-86b6-5d486671c13e" />

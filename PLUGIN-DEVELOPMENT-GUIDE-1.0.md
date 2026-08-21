# DeepSeek Harness 插件开发规范

**版本**：v1.0 | **适用版本**：dsh ≥ 0.1.0-rc.8

---

## 一、插件是什么

DeepSeek Harness 的一切能力都是插件。LLM 适配器是插件，工具是插件，UI 是插件，甚至 Agent 循环本身也是插件。插件运行在 Cordis IoC 容器内，通过事件、服务、依赖注入相互协作。

一个插件就是一个普通的 TypeScript 模块，导出 `name`、`inject`、`apply` 三个约定符号。

```typescript
export const name = 'my-plugin'
export const inject = ['tools']
export function apply(ctx: Context, config: Config): void {
  // 你的代码
}
```

---

## 二、插件生命周期

```
cordis.yml 声明 → import() 动态加载 → 创建 Fiber
→ 检查依赖 (PENDING) → 验证 Config → 执行 apply() (ACTIVE)
→ 运行中 → 热更新 (HMR) → 卸载 (DISPOSED)
```

### 你应该知道的关键事实

- 插件加载是**异步**的。`apply()` 可以是 async 函数。
- 插件卸载时，`ctx.effect()` 注册的 disposer 会**逆序执行**。
- 依赖不满足时，插件停留在 PENDING 状态，**不会报错**，只是等待。
- Config 验证失败会直接抛出 `ValidationError`，插件不会激活。

---

## 三、插件标准写法

### 3.1 命名空间插件（推荐）

```typescript
// src/index.ts

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** 插件名：用于日志、诊断、Fiber 标识 */
export const name = 'tool-my-awesome'

/** 依赖声明：这些服务就绪后才执行 apply */
export const inject = ['tools', 'systemPrompt']

/** 配置 Schema：自动验证，类型安全 */
export interface Config {
  enabled?: boolean
  maxItems?: number
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  maxItems: z.number().min(1).max(100).default(10),
})

/** 插件入口 */
export function apply(ctx: Context, config: Config): void {
  if (!config.enabled) return

  // 注册工具
  ctx.tools.register(defineTool({
    name: 'my_tool',
    description: 'Does something useful',
    parameters: {
      input: { type: 'string', required: true, description: 'The input' },
    },
    async execute(args, exec) {
      return { result: args.input.toUpperCase() }
    },
  }))

  // 注册系统 Prompt 段
  ctx.systemPrompt.section({
    name: 'my-tool-hint',
    order: 200,
    text: 'You have a tool called my_tool. Use it when needed.',
  })

  // 注册副作用（自动清理）
  ctx.effect(() => {
    const timer = setInterval(() => {
      ctx.logger.info('heartbeat')
    }, 60000)
    return () => clearInterval(timer)
  }, 'my-plugin.heartbeat')
}
```

### 3.2 cordis.yml 配置

```yaml
- id: my-awesome
  name: '@my-org/dsh-tool-my-awesome'
  config:
    enabled: true
    maxItems: 20
```

### 3.3 package.json

```json
{
  "name": "@my-org/dsh-tool-my-awesome",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-tools": "workspace:^"
  }
}
```

---

## 四、工具开发规范

### 4.1 工具定义标准

```typescript
ctx.tools.register(defineTool({
  // 必填：小写下划线命名，模型可见
  name: 'do_something',

  // 必填：清晰描述能力，模型靠这个决定是否调用
  description: 'Execute a specific operation on the given input and return the result.',

  // 必填：参数 Schema
  parameters: {
    path: {
      type: 'string',
      required: true,
      description: 'Absolute path to the target file.',
    },
    options: {
      type: 'object',
      description: 'Optional configuration.',
      properties: {
        verbose: { type: 'boolean', description: 'Enable verbose output.' },
      },
    },
  },

  // 可选：输出 Schema（用于结构化渲染）
  output: {
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'string' },
      },
    },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  },

  // 可选：超时（毫秒）
  timeoutMs: 30000,

  // 必填：执行函数
  async execute(args, exec) {
    // args 已经过类型校验
    // exec.signal 用于取消传播
    // exec.agent 获取当前 Agent
    return { success: true, data: 'done' }
  },
}))
```

### 4.2 工具命名规范

| 规则 | 正确 | 错误 |
|------|------|------|
| 小写下划线 | `my_tool` | `MyTool`、`myTool` |
| 动词开头 | `create_task` | `task_create` |
| 简洁明确 | `search_files` | `do_search`、`search_stuff` |
| 避免前缀冲突 | `my_search` | `search`（可能冲突） |

### 4.3 工具描述规范

描述是模型决定是否调用你的工具的**唯一依据**。写得好，模型用得准；写得差，模型乱调或不调。

**应该**：
- 用一句话说清楚工具做什么
- 说明输入输出的含义
- 说明适用场景和限制

**不应该**：
- 写模糊描述（"处理数据"）
- 省略参数描述
- 用内部术语（模型不懂）

```typescript
// ✅ 好的描述
description: 'Search for files matching a glob pattern within the workspace. Returns matching file paths sorted by modification time. Use this before reading or editing files to locate them first.'

// ❌ 差的描述
description: 'Search files'
```

---

## 五、事件系统规范

### 5.1 事件监听

```typescript
// 监听事件（不阻塞）
ctx.on('agent/status', ({ agent, status }) => {
  ctx.logger.info(`Agent ${agent.id} → ${status}`)
})

// 监听事件（带清理）
ctx.effect(() => {
  const handler = ({ agent, status }) => { /* ... */ }
  ctx.on('agent/status', handler)
  return () => { /* cleanup if needed */ }
}, 'my-plugin.status-listener')
```

### 5.2 Waterfall 中间件

Waterfall 是链式调用，每个处理器调用 `next()` 传递给下一个。

```typescript
// 拦截工具执行
ctx.on('tools/execute', async (exec, next) => {
  // 前置逻辑
  ctx.logger.info(`Executing: ${exec.name}`)

  // 调用下一个处理器（或最终执行）
  const result = await next()

  // 后置逻辑
  ctx.logger.info(`Completed: ${exec.name}, isError: ${result.isError}`)

  return result
})

// 拦截 LLM 请求（可修改配置）
ctx.on('llm/stream', async (options, next) => {
  // 可以修改 options
  // 可以直接返回自己的 AsyncIterable（短路）
  // 可以调用 next() 继续默认流程
  return next()
})

// 拦截 Agent 步骤（可拒绝）
ctx.on('agent/pre-step', async (payload, next) => {
  // 返回 { kind: 'reject' } 拒绝步骤
  // 返回 next() 继续
  return next()
})
```

### 5.3 事件命名空间

| 命名空间 | 用途 | 示例 |
|----------|------|------|
| `agent/*` | Agent 生命周期 | `agent/status`, `agent/error` |
| `session/*` | Session 事件 | `session/event`, `session/created` |
| `tools/*` | 工具执行 | `tools/execute`, `tools/pre-execute` |
| `llm/*` | LLM 调用 | `llm/stream`, `llm/adapters-updated` |
| `subagent/*` | 子 Agent | `subagent/start`, `subagent/end` |
| `approval/*` | 审批 | `approval/request` |
| `internal/*` | 框架内部 | `internal/plugin`, `internal/config` |

---

## 六、服务注册与依赖注入

### 6.1 提供服务

```typescript
class MyService {
  constructor(private ctx: Context) {}

  async doWork(): Promise<string> {
    return 'result'
  }
}

export function apply(ctx: Context): void {
  // 提供服务供其他插件使用
  ctx.provide('myService', new MyService(ctx))
}
```

### 6.2 注入依赖

```typescript
// 方式 1：静态声明
export const inject = ['tools', 'agents', 'myService']

export function apply(ctx: Context): void {
  const tools = ctx.get('tools')
  const agents = ctx.get('agents')
}

// 方式 2：动态注入（依赖就绪后执行）
ctx.inject(['myService'], (ctx) => {
  const service = ctx.get('myService')
  service.doWork()
})
```

### 6.3 服务可用性检查

```typescript
// 检查服务是否可用（不阻塞）
const service = ctx.get('myService')
if (service !== undefined) {
  // 使用服务
}

// 等待服务可用（阻塞）
ctx.inject(['myService'], (ctx) => {
  // 这里 myService 一定可用
})
```

---

## 七、系统 Prompt 注入

### 7.1 注入静态段

```typescript
ctx.systemPrompt.section({
  name: 'my-instructions',
  order: 100,  // 数字越小越靠前
  text: `You have access to custom tools. Follow these rules:
1. Always verify before executing
2. Report results clearly`,
})
```

### 7.2 注入动态段

```typescript
ctx.systemPrompt.section({
  name: 'my-context',
  order: 150,
  text: (context) => {
    // context.agent 当前 Agent
    // context.scope 作用域
    const cwd = context.agent?.session.header.cwd
    return cwd ? `Working directory: ${cwd}` : ''
  },
})
```

### 7.3 注入变量

```typescript
ctx.systemPrompt.variable('myVar', context => 'value')
// 在 Prompt 中使用 {{myVar}}
```

---

## 八、Agent 操作

### 8.1 创建 Agent

```typescript
const agents = ctx.get('agents')!
const { agent } = await agents.create({
  sessionId: SessionId(`child-${randomUUID()}`),
  meta: { cwd: process.cwd() },
  agentOptions: {
    provider: 'deepseek-official',
    model: 'deepseek-v4-pro',
  },
})
```

### 8.2 向 Agent 发送消息

```typescript
import { createUserMessage } from '@deepseek-ai/dsh-llm'

// 排队等下一轮
agent.followup(createUserMessage({
  content: [{ type: 'text', text: 'Do something' }],
  source: { kind: 'user' },
}))

// 当前轮内注入（steer）
agent.steer(createUserMessage({
  content: [{ type: 'text', text: 'Change direction' }],
  source: { kind: 'plugin', plugin: 'my-plugin' },
}))
```

### 8.3 等待 Agent 完成

```typescript
await agent.whenIdle()
```

### 8.4 取消 Agent

```typescript
agent.cancel({ kind: 'user-cancel' })
```

---

## 九、配置管理

### 9.1 Schema 定义

```typescript
import z from '@deepseek-ai/schemastery'

export const Config: z<Config> = z.object({
  // 带默认值
  enabled: z.boolean().default(true),

  // 必填
  apiKey: z.string().required(),

  // 枚举
  mode: z.union(['fast', 'balanced', 'quality'] as const).default('balanced'),

  // 数值范围
  maxRetries: z.number().min(0).max(10).default(3),

  // 数组
  models: z.array(z.object({
    id: z.string().required(),
    name: z.string(),
  })).default([]),

  // 可选
  baseURL: z.string(),
})
```

### 9.2 运行时配置更新

```typescript
// 配置变更时自动重启插件
// Cordis 会自动处理：验证新配置 → 卸载旧实例 → 加载新实例
```

---

## 十、安全规范

### 10.1 应该做的

| 规则 | 说明 |
|------|------|
| 验证所有输入 | `args` 来自模型，不可信 |
| 使用 `exec.signal` | 支持取消传播 |
| 限制资源使用 | 设置 `timeoutMs` |
| 清理副作用 | 通过 `ctx.effect()` 返回 disposer |
| 最小权限原则 | 只申请需要的依赖 |
| 审计敏感操作 | 记录日志 |

### 10.2 不应该做的

| 规则 | 原因 |
|------|------|
| 不要硬编码 API Key | 使用 `ctx.credentials` |
| 不要忽略 signal | 会导致资源泄漏 |
| 不要在 apply() 中做重型操作 | 阻塞其他插件加载 |
| 不要修改全局状态 | 影响其他插件 |
| 不要使用 `process.exit()` | 破坏优雅关闭 |
| 不要吞掉异常 | 使用 `ctx.logger.error()` |
| 不要依赖加载顺序 | 通过依赖注入声明 |

### 10.3 工具执行安全

```typescript
async execute(args, exec) {
  // ✅ 检查取消信号
  exec.signal.throwIfAborted()

  // ✅ 验证输入
  if (!args.path || typeof args.path !== 'string') {
    throw new Error('path must be a non-empty string')
  }

  // ✅ 限制超时
  const result = await Promise.race([
    doWork(args),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 30000)
    ),
  ])

  // ✅ 返回结构化错误
  if (result.error) {
    return {
      content: [{ type: 'text', text: `Error: ${result.error}` }],
      isError: true,
    }
  }

  return { content: [{ type: 'text', text: result.data }] }
}
```

---

## 十一、测试规范

### 11.1 单元测试

```typescript
import { describe, it, expect } from 'vitest'

describe('my-tool', () => {
  it('should process input correctly', async () => {
    const result = await execute({ input: 'hello' }, mockExec)
    expect(result.content[0].text).toBe('HELLO')
  })

  it('should handle errors gracefully', async () => {
    const result = await execute({ input: '' }, mockExec)
    expect(result.isError).toBe(true)
  })
})
```

### 11.2 集成测试

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { createTestContext } from '@deepseek-ai/dsh-test-support'

describe('my-plugin integration', () => {
  let ctx: Context

  beforeAll(async () => {
    ctx = await createTestContext([
      { name: 'my-plugin', config: { enabled: true } },
    ])
  })

  it('should register tool', () => {
    const tools = ctx.get('tools')
    expect(tools.get('my_tool')).toBeDefined()
  })
})
```

---

## 十二、发布规范

### 12.1 包命名

```
@dsh-plugin/tool-my-awesome      # 工具插件
@dsh-plugin/llm-my-provider       # LLM 适配器
@dsh-plugin/subagent-my-backend   # 子 Agent Provider
@dsh-plugin/my-feature            # 功能插件
```

### 12.2 目录结构

```
my-plugin/
├── src/
│   └── index.ts          # 插件入口
├── tests/
│   ├── unit.spec.ts      # 单元测试
│   └── integration.spec.ts # 集成测试
├── package.json
├── tsconfig.json
├── README.md             # 使用文档
└── LICENSE
```

### 12.3 README 模板

```markdown
# @dsh-plugin/tool-my-awesome

Brief description of what this plugin does.

## Installation

\`\`\`yaml
# cordis.yml
- id: my-awesome
  name: '@dsh-plugin/tool-my-awesome'
  config:
    enabled: true
\`\`\`

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| enabled | boolean | true | Enable/disable |
| maxItems | number | 10 | Maximum items |

## Tools

### `my_tool`

Description of the tool.

**Parameters:**
- `input` (string, required): The input

**Returns:** `{ result: string }`

## License

MIT
```

---

## 十三、常见错误

### 错误 1：忘记声明依赖

```typescript
// ❌ 错误：tools 可能还没加载
export function apply(ctx: Context) {
  ctx.tools.register(...)  // tools 可能是 undefined
}

// ✅ 正确：声明依赖
export const inject = ['tools']
export function apply(ctx: Context) {
  ctx.tools.register(...)  // tools 一定可用
}
```

### 错误 2：不清理副作用

```typescript
// ❌ 错误：timer 永远不会清理
export function apply(ctx: Context) {
  setInterval(() => { /* ... */ }, 1000)
}

// ✅ 正确：通过 effect 注册清理
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => { /* ... */ }, 1000)
    return () => clearInterval(timer)
  }, 'my-plugin.timer')
}
```

### 错误 3：忽略取消信号

```typescript
// ❌ 错误：无法取消
async execute(args) {
  const result = await fetch(url)  // 无法取消
  return { content: [{ type: 'text', text: result }] }
}

// ✅ 正确：传播 signal
async execute(args, exec) {
  const result = await fetch(url, { signal: exec.signal })
  return { content: [{ type: 'text', text: result }] }
}
```

### 错误 4：apply() 中做重型操作

```typescript
// ❌ 错误：阻塞所有插件加载
export async function apply(ctx: Context) {
  await downloadLargeFile()  // 阻塞 10 秒
}

// ✅ 正确：异步执行，不阻塞
export function apply(ctx: Context) {
  ctx.effect(() => {
    const task = downloadLargeFile()
    task.catch(err => ctx.logger.error(err))
    return () => { /* cancel if needed */ }
  }, 'my-plugin.download')
}
```

### 错误 5：硬编码配置

```typescript
// ❌ 错误：无法配置
export function apply(ctx: Context) {
  const apiKey = 'sk-xxx'
}

// ✅ 正确：使用配置和凭据服务
export function apply(ctx: Context, config: Config) {
  const credentials = ctx.get('credentials')
  // 通过 credentials.resolve() 获取
}
```

---

## 十四、最佳实践清单

### 开发前

- [ ] 阅读本文档
- [ ] 研究现有插件（`packages/*/tool-*/src/index.ts`）
- [ ] 确定插件类型（工具 / LLM / 子 Agent / 功能）
- [ ] 设计 Config Schema

### 开发中

- [ ] 使用命名空间插件导出（`name` + `inject` + `apply`）
- [ ] 声明所有依赖
- [ ] 定义 Config Schema 并设置合理默认值
- [ ] 工具描述清晰准确
- [ ] 所有异步操作支持 `exec.signal`
- [ ] 通过 `ctx.effect()` 管理副作用
- [ ] 使用 `ctx.logger` 记录日志
- [ ] 验证所有外部输入

### 开发后

- [ ] 编写单元测试
- [ ] 编写集成测试
- [ ] 编写 README 文档
- [ ] 测试插件卸载（确保无泄漏）
- [ ] 测试配置更新（确保 HMR 正常）

---

## 十五、参考资源

| 资源 | 位置 |
|------|------|
| Cordis 框架 | `vendor/cordis/src/` |
| 工具定义 | `packages/core/tools/src/index.ts` |
| LLM 适配器 | `packages/llm/llm-deepseek/src/index.ts` |
| 子 Agent Provider | `packages/subagent/subagent/src/` |
| MCP 客户端 | `packages/mcp/mcp-client/src/index.ts` |
| 示例插件 | `packages/examples/agent-spine-demo/src/index.ts` |
| 无头示例 | `examples/headless-agent/cordis.yml` |
| 工具示例 | `packages/shell/tool-bash/src/index.ts` |
| 事件类型 | `packages/core/session/src/known-event-types.ts` |
| RPC API | `packages/host/apiproxy/src/api/rpc-map.ts` |

---

*本文档基于 DeepSeek Harness 源码分析生成，适用于 dsh 0.1.0-rc.8 及以上版本。*

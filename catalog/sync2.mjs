import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const I = path.join(__dirname, 'intents.json');
const intents = require(I);

const toAdd = [
  {
    repo: 'Isilsolme/dsh-splash-launcher',
    lists: ['plugin'],
    dshCategory: 'utility',
    isDshPlugin: true,
    dshSignals: ['readme-mentions-dsh'],
    manifestType: 'none',
    language: 'C#',
    intent: 'One-click Windows launcher for the DeepSeek Harness (dsh) Web GUI with a stroke-by-stroke startup animation.',
    intentEn: 'One-click Windows launcher for the DeepSeek Harness (dsh) Web GUI with a stroke-by-stroke startup animation.',
    intentZh: 'DSH Web GUI 的 Windows 一键启动器：无边框描边动画 + 后台拉起 dsh web，关窗自动停服务。',
    zhSource: 'native',
    enSource: 'native',
    needsReview: false,
    techStack: ['C#'],
    keyDeps: [],
    entry: null,
    stars: 0,
    forks: 0,
    created_at: '2026-08-16',
    updated_at: '2026-08-16',
    license: 'MIT',
    open_issues: 0,
    topics: ['deepseek-harness', 'dsh-plugin', 'launcher'],
    cloned: false,
    compat: 'unknown',
    featured: false,
    analyzed_at: new Date().toISOString()
  },
  {
    repo: 'Isilsolme/dsh-anthropic-fonts',
    lists: ['plugin'],
    dshCategory: 'ui',
    isDshPlugin: true,
    dshSignals: ['readme-mentions-dsh'],
    manifestType: 'none',
    language: 'JavaScript',
    intent: 'Switch the DSH web interface to Anthropic Sans Web Text and model conversation to Anthropic Serif Web Text.',
    intentEn: 'Switch the DSH web interface to Anthropic Sans Web Text and model conversation to Anthropic Serif Web Text.',
    intentZh: '给 DSH Web 界面换上 Anthropic 字体：界面用 Anthropic Sans，对话用 Anthropic Serif，代码用 Anthropic Mono。',
    zhSource: 'native',
    enSource: 'native',
    needsReview: false,
    techStack: ['JavaScript'],
    keyDeps: [],
    entry: null,
    stars: 0,
    forks: 0,
    created_at: '2026-08-16',
    updated_at: '2026-08-16',
    license: 'MIT',
    open_issues: 0,
    topics: ['deepseek-harness', 'dsh-plugin', 'fonts'],
    cloned: false,
    compat: 'unknown',
    featured: false,
    analyzed_at: new Date().toISOString()
  }
];

for (const e of toAdd) {
  if (intents[e.repo]) { console.log('SKIP existing', e.repo); continue; }
  intents[e.repo] = e;
  console.log('ADDED', e.repo);
}

const mneme = intents['modusensus/dsh-mneme'];
if (mneme) {
  mneme.intentEn = 'Structured memory engine for DeepSeek Harness. Offline semantic search, entity-attribute-timeline, autoDream self-consolidation, and human-editable Markdown storage.';
  mneme.intentZh = 'DeepSeek Harness 结构化记忆引擎。离线语义搜索、实体-属性-时间轴、autoDream 自我巩固、可人工编辑的 Markdown 存储。';
  mneme.intent = mneme.intentEn;
  mneme.updated_at = new Date().toISOString().slice(0, 10);
  console.log('UPDATED dsh-mneme');
} else {
  console.log('dsh-mneme NOT FOUND');
}

fs.writeFileSync(I, JSON.stringify(intents, null, 2) + '\n');
console.log('intents count:', Object.keys(intents).length);

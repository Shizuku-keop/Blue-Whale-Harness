#!/usr/bin/env node
/**
 * run-intake-gate.mjs — 收录 PR 合并闸门执行器（CI 用，规范 §8.2）
 *
 * 流程：读取 find-new-repos.mjs 的产物 → 逐个浅克隆 → 用 check-compat.mjs 的 runGate 评估 →
 *       输出 Markdown 汇总到 $GITHUB_STEP_SUMMARY（或 --summary 指定路径）→ 任一未过则退出 1。
 *
 * 用法：
 *   node ci/run-intake-gate.mjs --repos <new-repos.json> --clones <克隆根> \
 *        [--risk360 catalog/risk-360.json] [--summary <md-path>] [--check <path>]
 * 退出码：0=全部通过；1=存在未通过项（CI 状态检查失败）。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGate } from '../catalog/check-compat.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };

const reposPath = arg('--repos');
const clonesRoot = arg('--clones');
const risk360 = arg('--risk360') || null;
const summaryPath = arg('--summary') || process.env.GITHUB_STEP_SUMMARY || null;
const checkPath = arg('--check') || null; // 可选：输出 JSON 结果文件

if (!reposPath || !clonesRoot) {
  console.error('用法: node ci/run-intake-gate.mjs --repos <json> --clones <dir> [--risk360 <path>] [--summary <path>]');
  process.exit(2);
}

const repos = JSON.parse(readFileSync(reposPath, 'utf8'));
if (!repos.length) { console.log('没有新增仓库，闸门放行。'); process.exit(0); }

const results = [];
for (const item of repos) {
  const repo = item.repo;
  const [owner, name] = repo.split('/');
  const repoDir = join(clonesRoot, 'Plugins', owner, name);
  // 浅克隆（GitHub Actions 内可达 github.com）
  if (!existsSync(join(repoDir, '.git'))) {
    mkdirSync(join(repoDir, '..'), { recursive: true });
    try {
      execFileSync('git', ['clone', '--depth', '1', `https://github.com/${repo}.git`, repoDir], { stdio: 'pipe' });
    } catch (e) {
      results.push({
        repo, list: item.lists.includes('plugin') ? 'plugin' : 'watch',
        level: 'ERR', compatLabel: 'clone-failed', pass: false,
        checks: { manifest: { ok: false, message: '克隆失败: ' + (e.stderr || e.message).toString().slice(0, 300) } },
        reasons: ['无法克隆仓库（不存在/私有/网络失败）'],
      });
      continue;
    }
  }
  const list = item.lists && item.lists.includes('plugin') ? 'plugin' : 'watch';
  results.push(runGate(repo, clonesRoot, { list, risk360Path: risk360 }));
}

const anyFail = results.some(r => !r.pass);
const summary = results.map(r => ({
  repo: r.repo, list: r.list, level: r.level, compatLabel: r.compatLabel, pass: r.pass, reasons: r.reasons,
})).reduce((acc, r) => { acc.push(r); return acc; }, []);

// 结果文件（供后续步骤/评论用）
if (checkPath) writeFileSync(checkPath, JSON.stringify(summary, null, 1));

// GITHUB_STEP_SUMMARY Markdown
const md = [
  '## 🤖 目录收录兼容性闸门（规范 v1.0）',
  '',
  `当前版本线：**0.1.1-rc.2** ｜ 新增仓库：**${repos.length}** ｜ 结果：**${anyFail ? '❌ 存在未通过项' : '✅ 全部通过'}**`,
  '',
  '| 仓库 | 列表 | 档位 | 建议 compat | 结果 | 原因 |',
  '|---|---|---|---|---|---|',
  ...results.map(r =>
    `| \`${r.repo}\` | ${r.list} | ${r.level} | ${r.compatLabel} | ${r.pass ? '✅' : '❌'} | ${r.reasons.join('<br>') || '—'} |`),
  '',
  '> 判定依据：《插件兼容性规范 v1.0》§3/§4/§6；未通过项处理见 §5.3（人工复核）或由作者修正后重新推送。',
].join('\n');

if (summaryPath) writeFileSync(summaryPath, md);
console.log(md);

process.exit(anyFail ? 1 : 0);

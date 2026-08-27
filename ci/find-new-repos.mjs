#!/usr/bin/env node
/**
 * find-new-repos.mjs — 从 PR diff 中提取新增仓库（CI 用，规范 §8.2）
 *
 * 对比 base..head 的 repos.txt 与 repos.json：
 *   - repos.txt：新增行 = 新仓库（每行 owner/name）
 *   - repos.json：head 中存在但 base 中不存在的 repo 键 = 新仓库
 * 目标列表（plugin/watch）取 head 版 repos.json 的 _lists；若仅存在于 repos.txt，默认按 plugin 处理（从严）。
 *
 * 用法：node ci/find-new-repos.mjs --base <base-sha> [--head <head-sha|HEAD>] [--root <repo-root>]
 * 输出：stdout JSON 数组 [{"repo":"owner/name","lists":["plugin"]}, ...]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const base = arg('--base');
const head = arg('--head') || 'HEAD';
const root = arg('--root') || process.cwd();

if (!base) { console.error('缺少 --base <sha>'); process.exit(1); }

const git = (args, ref = null) => {
  const full = ref ? [...args, ref] : args;
  return execFileSync('git', full, { cwd: root, encoding: 'utf8', maxBuffer: 1e8 });
};

function addedLinesFromTxt(baseRef, headRef, file) {
  // git diff base..head -- file，取以 + 开头且非 +++ 的行
  const diff = git(['diff', `${baseRef}..${headRef}`, '--', file]);
  return diff.split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .map(l => l.slice(1).trim())
    .filter(l => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(l));
}

function reposFromJson(ref) {
  const txt = git(['show', `${ref}:repos.json`]);
  try { return JSON.parse(txt); } catch { return []; }
}

const newRepos = [];
const seen = new Set();

// repos.txt 新增行
try {
  for (const line of addedLinesFromTxt(base, head, 'repos.txt')) {
    if (!seen.has(line)) { seen.add(line); newRepos.push({ repo: line, source: 'repos.txt' }); }
  }
} catch (e) { console.error('repos.txt diff 解析失败:', e.message); }

// repos.json 新增条目
try {
  const baseRepos = new Set(reposFromJson(base).map(r => r.repo));
  const headRepos = reposFromJson(head);
  for (const r of headRepos) {
    if (!baseRepos.has(r.repo) && !seen.has(r.repo)) {
      seen.add(r.repo);
      newRepos.push({ repo: r.repo, source: 'repos.json', lists: r._lists || [] });
    }
  }
} catch (e) { console.error('repos.json diff 解析失败:', e.message); }

// 补充 lists：优先 repos.json；仅 repos.txt 来源的默认 plugin（从严）
const headRepoMap = new Map();
try { for (const r of reposFromJson(head)) headRepoMap.set(r.repo, r._lists || []); } catch {}
const out = newRepos.map(n => ({
  repo: n.repo,
  lists: n.lists && n.lists.length ? n.lists : (headRepoMap.get(n.repo) || ['plugin']),
  source: n.source,
}));

// 输出前校验 repos.json 路径存在（不存在则提示）
if (!existsSync(join(root, 'repos.json'))) console.error('警告: 仓库根目录未见 repos.json，仅按 repos.txt 判定');

console.log(JSON.stringify(out, null, 1));
if (!out.length) process.exit(0);

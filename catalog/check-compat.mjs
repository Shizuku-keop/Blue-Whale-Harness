#!/usr/bin/env node
/**
 * check-compat.mjs — DeepSeek Harness 插件兼容性核查脚本（Blue-Whale-Harness 目录规范 v1.0 的自动化落地）
 *
 * 两种模式：
 *   1) 批量核查：node check-compat.mjs --dir <clones-root>
 *        扫描 <clones-root>/Plugins/<owner>/<name>/ 下已克隆的全部仓库（与 catalog 的 clone.mjs 布局一致），
 *        读取 package.json + cordis.patch.yml，按本规范输出逐仓库兼容性判定。
 *        产物：<clones-root>/catalog/compat-suggestions.json（可直接并入 intents.json 的 compat 字段）
 *   2) 单仓核查（录入新插件时用）：node check-compat.mjs --repo owner/name --dir <clones-root>
 *        对单个仓库输出完整核查报告（人工复核清单所需全部证据）。
 *
 * 判定模型与《插件兼容性规范 v1.0》一致：
 *   档位      A=已确认兼容（cordis.patch.yml + 声明范围覆盖当前版本线，或维护者实测）
 *             B=基本兼容（有 DSH 插件形态，但版本证据不完整 / 依赖运行时注入）
 *             C=无法核实（根目录无 manifest/依赖，多为 monorepo 子目录、预设、内容仓库）
 *             D=有风险 / 非插件（运行时依赖钉死旧版本线、非 JS 运行时、AV 标记、非 DSH 插件）
 *
 * 依赖：仅 Node 内置模块，离线运行。版本线为内嵌常量（更新 dsh 时同步修改 CURRENT / TRAIN）。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

// main 守卫：被其他脚本 import 时只导出函数，不执行 CLI
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

// ---------------- 版本线（官方 npm 实测，2026-08-27） ----------------
// @deepseek-ai/dsh 及全部子包共用同一发布序列；@deepseek-ai/dsh 的 dist-tag latest 才指向当前版，
// 子包 dist-tags 错误指向 0.0.1-rc.1（官方 bug，勿以 dist-tag 判定版本）。
export const CURRENT = '0.1.1-rc.2';
export const TRAIN = [
  '0.0.1-rc.1', '0.0.1-rc.2', '0.0.1-rc.3', '0.0.1-rc.5',
  '0.1.0-rc.2', '0.1.0-rc.3', '0.1.0-rc.6', '0.1.0-rc.7', '0.1.0-rc.8',
  '0.1.1-rc.1', '0.1.1-rc.2',
];
const TRAIN_IDX = Object.fromEntries(TRAIN.map((v, i) => [v, i]));
const MIN_RC6_IDX = TRAIN_IDX['0.1.0-rc.6'];
const CUR_IDX = TRAIN_IDX[CURRENT];

function cmpVer(a, b) {
  const pa = a.split(/[-+]/)[0].split('.').map(Number);
  const pb = b.split(/[-+]/)[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d !== 0) return d; }
  return 0;
}

/** 解析 npm 版本范围，返回 {kind,min,coversCurrent} 或 null */
export function parseRange(range) {
  if (!range) return null;
  const r = String(range).trim();
  if (/workspace|file:|link:|git|http/.test(r)) return { kind: 'unresolvable' };
  const exact = r.match(/^([0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?)$/);
  if (exact) {
    const idx = TRAIN_IDX[exact[1]];
    return idx === undefined ? { kind: 'unresolvable' } : { kind: 'exact', min: exact[1], coversCurrent: idx === CUR_IDX };
  }
  const caret = r.match(/^\^([0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?)$/);
  if (caret) {
    const idx = TRAIN_IDX[caret[1]];
    if (idx === undefined) return { kind: 'unresolvable' };
    const [maj, min] = caret[1].split('.');
    return { kind: 'caret', min: caret[1], coversCurrent: maj === '0' && Number(min) >= 1 };
  }
  const tilde = r.match(/^~([0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?)$/);
  if (tilde) {
    const idx = TRAIN_IDX[tilde[1]];
    if (idx === undefined) return { kind: 'unresolvable' };
    return { kind: 'tilde', min: tilde[1], coversCurrent: idx === CUR_IDX };
  }
  const loHi = r.match(/^>=\s*([0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?)\s*<\s*([0-9]+\.[0-9]+\.[0-9]+)/);
  if (loHi) {
    const lo = TRAIN_IDX[loHi[1]];
    if (lo === undefined) return { kind: 'unresolvable' };
    return { kind: 'range', min: loHi[1], coversCurrent: lo <= CUR_IDX && cmpVer(CURRENT, loHi[2]) < 0 };
  }
  const gt = r.match(/^>\s*([0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?)/);
  if (gt) {
    const lo = TRAIN_IDX[gt[1]];
    if (lo === undefined) return { kind: 'unresolvable' };
    return { kind: 'gt', min: gt[1], coversCurrent: lo < CUR_IDX };
  }
  if (r.includes('||')) {
    const evals = r.split('||').map(p => p.trim()).map(parseRange).filter(Boolean);
    const resolvable = evals.filter(e => e.kind !== 'unresolvable');
    if (!resolvable.length) return { kind: 'unresolvable' };
    return { kind: 'union', min: resolvable.map(e => e.min).sort((a, b) => TRAIN_IDX[a] - TRAIN_IDX[b])[0], coversCurrent: resolvable.some(e => e.coversCurrent) };
  }
  if (r === '*' || r === 'latest') return { kind: 'any', coversCurrent: true };
  return { kind: 'unparsed', raw: r };
}

/** 判定单个仓库（已克隆目录） */
export function checkRepo(repo, dir) {
  const rec = { repo, ok: false, errors: [] };
  const pkgPath = join(dir, 'package.json');
  const manifestPath = join(dir, 'cordis.patch.yml');
  const hasManifestFile = existsSync(manifestPath);
  let pkg = null;
  if (existsSync(pkgPath)) {
    try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch { rec.errors.push('package.json 无法解析'); }
  } else {
    rec.errors.push('根目录无 package.json（可能是 monorepo / 子目录插件 / 预设 / 内容仓库）');
  }
  if (!hasManifestFile) rec.errors.push('根目录无 cordis.patch.yml');
  else {
    const raw = readFileSync(manifestPath, 'utf8');
    // 粗校验：期望是 YAML 列表（- insert: 或 - id:）
    if (!/^-\s*(insert|id):/m.test(raw)) rec.errors.push('cordis.patch.yml 不是预期结构（应为 - insert: 或 - id: 列表）');
  }

  const parsed = {};
  if (pkg) {
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [p, range] of Object.entries(pkg[section] || {})) {
        if (p.startsWith('@deepseek-ai/') || p === '@deepseek-ai' || p.startsWith('@koishijs/') || p === 'koishi' || p.startsWith('@cordisjs/')) {
          parsed[p] = { range: String(range), section, ...parseRange(String(range)) };
        }
      }
    }
  }
  const dshRanges = Object.fromEntries(Object.entries(parsed).filter(([p]) => p.startsWith('@deepseek-ai/')));
  const koishiRanges = Object.entries(parsed).filter(([p]) => p.startsWith('@koishijs/') || p === 'koishi');
  const hasDshDep = Object.keys(dshRanges).length > 0;
  const coversCurrent = Object.values(dshRanges).some(v => v.coversCurrent === true);
  const anyResolvable = Object.values(dshRanges).some(v => v.min !== undefined);
  const minTrain = (() => {
    let min = null;
    for (const v of Object.values(dshRanges)) {
      if (v.min === undefined) continue;
      const idx = TRAIN_IDX[v.min];
      if (idx === undefined) continue;
      if (min === null || idx < TRAIN_IDX[min]) min = v.min;
    }
    return min;
  })();

  // ---- 判定 ----
  let level = 'C', label = 'unknown';
  const evidence = [];
  const runtimeOld = Object.entries(dshRanges).filter(([p, v]) => v.section === 'dependencies' && v.coversCurrent === false && v.min !== undefined);

  // 硬性项补充证据
  const badRanges = Object.entries(parsed)
    .filter(([p, v]) => (p.startsWith('@deepseek-ai/') || p.startsWith('@cordisjs/') || p === 'cordis') && v.kind === 'any')
    .map(([p, v]) => ({ pkg: p, range: v.range, section: v.section, reason: 'latest/*/裸版本（dist-tags 错配陷阱）' }));
  const scopeSquat = !!(pkg?.name && pkg.name.startsWith('@deepseek-ai/') && repo.split('/')[0] !== 'deepseek-ai');
  const entryExists = pkg?.main ? existsSync(join(dir, pkg.main)) : null; // null=未声明 main（预设/技能等，不适用）

  if (koishiRanges.length > 0 && !hasDshDep) {
    level = 'D'; label = 'koishi-only';
    evidence.push('koishi 依赖（非 DSH 生态）: ' + koishiRanges.map(([p, v]) => p + '@' + v.range).join(', '));
  } else if (runtimeOld.length > 0) {
    level = 'D'; label = 'old-line';
    evidence.push('运行时依赖钉死旧版本线（双拷贝/API 错配风险）: ' + runtimeOld.map(([p, v]) => p + '@' + v.range).join(', '));
  } else if (hasManifestFile && coversCurrent && minTrain && TRAIN_IDX[minTrain] >= MIN_RC6_IDX) {
    level = 'A'; label = `${minTrain}+`;
    evidence.push('cordis.patch.yml；声明范围覆盖当前 ' + CURRENT + '（min=' + minTrain + '）: ' + Object.entries(dshRanges).map(([p, v]) => p + '@' + v.range).join(', '));
  } else if (hasManifestFile && hasDshDep) {
    level = 'B'; label = minTrain ? `${minTrain}+(inferred)` : 'declared';
    evidence.push('cordis.patch.yml + @deepseek-ai 依赖: ' + Object.entries(dshRanges).map(([p, v]) => p + '@' + v.range).join(', '));
  } else if (hasManifestFile) {
    level = 'B'; label = 'runtime-injected';
    evidence.push('cordis.patch.yml 存在但无 @deepseek-ai 依赖（web 客户端运行时注入模式）');
  } else if (hasDshDep) {
    level = 'B'; label = minTrain ? `${minTrain}+(declared-deps)` : 'declared-deps';
    evidence.push('无 cordis.patch.yml 但有 @deepseek-ai 依赖: ' + Object.entries(dshRanges).map(([p, v]) => p + '@' + v.range).join(', '));
  } else {
    level = 'C'; label = 'unknown';
    evidence.push('根目录无 manifest/依赖证据（需人工复核：monorepo 子目录 / 预设 / 技能 / 内容仓库）');
  }

  return {
    repo, level, compatLabel: label, minTrain: minTrain || null, coversCurrent,
    manifestAtRoot: hasManifestFile, pkgName: pkg?.name || null, pkgVersion: pkg?.version || null,
    engines: pkg?.engines || null, hasDshDep, dshRanges,
    badRanges, scopeSquat, entryExists,
    evidence, errors: rec.errors, ok: rec.errors.length === 0,
  };
}

/**
 * 合并闸门评估（规范附录 A 硬性项）——CI 用。
 * @param {string} repo owner/name
 * @param {string} dir  克隆根（含 Plugins/<owner>/<name>）
 * @param {{list?: 'plugin'|'watch', risk360Path?: string|null}} opts
 * @returns {{repo, list, level, compatLabel, pass, checks, reasons}}
 */
export function runGate(repo, dir, opts = {}) {
  const list = opts.list || 'plugin';
  const repoDir = join(dir, 'Plugins', ...repo.split('/'));
  const verdict = checkRepo(repo, repoDir);
  const checks = {};
  const reasons = [];

  // risk-360 AV 名单（路径指向仓库内 catalog/risk-360.json）
  let risk360Repos = new Set();
  let avNote = '未提供 risk-360 名单，AV 检查跳过';
  if (opts.risk360Path && existsSync(opts.risk360Path)) {
    try {
      risk360Repos = new Set(JSON.parse(readFileSync(opts.risk360Path, 'utf8')).map(r => r.repo));
      avNote = '';
    } catch { avNote = 'risk-360 解析失败，AV 检查跳过'; }
  }
  const avFlagged = risk360Repos.has(repo);

  const note = (ok, msg) => ({ ok, message: msg });

  // 1) manifest 结构（真插件必须 ok）
  checks.manifest = note(verdict.ok, verdict.errors.length ? verdict.errors.join('；') : 'manifest 结构正常');
  if (!verdict.ok && list === 'plugin') reasons.push('manifest 结构异常: ' + verdict.errors.join('；'));

  // 2) 档位门槛（plugin 列表：A/B 才放行，C 需人工复核，D 打回；watch：仅 AV 硬性）
  checks.level = note(list === 'plugin' ? verdict.level === 'A' || verdict.level === 'B' : true,
    `档位 ${verdict.level}（${verdict.compatLabel}）`);
  if (list === 'plugin' && verdict.level === 'D') reasons.push(`档位 D（${verdict.compatLabel}）不得进入 plugin 列表`);
  if (list === 'plugin' && verdict.level === 'C') reasons.push('档位 C（无法核实）需人工复核（monorepo 子目录请指明插件路径）');
  if (list === 'watch' && verdict.level === 'D' && verdict.compatLabel === 'old-line') {
    checks.level = note(false, '运行时依赖钉死旧版本线');
    reasons.push('watch 条目运行时依赖钉死旧版本线（old-line）');
  }

  // 3) 禁止 latest/*/裸版本（dist-tags 陷阱）
  const bare = (verdict.badRanges || []).filter(b => b.section !== 'devDependencies');
  checks.noBare = note(bare.length === 0, bare.length ? bare.map(b => `${b.pkg}@${b.range}(${b.section})`).join('；') : '无 latest/*/裸版本声明');
  if (bare.length) reasons.push('官方依赖使用 latest/*/裸版本: ' + bare.map(b => b.pkg + '@' + b.range).join('；'));

  // 4) @deepseek-ai 作用域占用
  checks.noScopeSquat = note(!verdict.scopeSquat, verdict.scopeSquat ? `包名 ${verdict.pkgName} 占用官方作用域 @deepseek-ai/*` : '未占用官方作用域');
  if (verdict.scopeSquat) reasons.push(`禁止以 @deepseek-ai/* 作用域发布（${verdict.pkgName}）`);

  // 5) 入口文件存在
  checks.entry = note(verdict.entryExists !== false,
    verdict.entryExists === null ? '未声明 main（预设/技能形态，不适用）' : verdict.entryExists ? '入口文件存在' : `入口 ${verdict.pkgName ? '' : ''}main 指向不存在`);
  if (verdict.entryExists === false) reasons.push('package.json main 指向的文件不存在');

  // 6) AV 名单
  checks.av = note(!avFlagged, avFlagged ? `在 risk-360 AV 名单中` : avNote || '不在 AV 名单');
  if (avFlagged) reasons.push('仓库在 AV 标记名单中，需人工复核（规范 §6.3）');

  const pass = reasons.length === 0;
  return { repo, list, level: verdict.level, compatLabel: verdict.compatLabel, pass, checks, reasons };
}

function usage() {
  console.log(`check-compat.mjs — DSH 插件兼容性核查（规范 v1.0）
用法:
  node check-compat.mjs --dir <clones-root>                      批量核查 <clones-root>/Plugins/<owner>/<name>
  node check-compat.mjs --repo owner/name --dir <clones-root>    单仓核查（录入新插件用）
  node check-compat.mjs --gate --repo owner/name --dir <clones-root> [--list plugin|watch] [--risk360 <path>]
                                                                合并闸门（CI 用）：通过退出 0，未通过退出 1
当前版本线: ${CURRENT}
`);
}

if (isMain) {
  const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };

const dir = arg('--dir');
const repo = arg('--repo');
const isGate = argv.includes('--gate');
if (!dir) { usage(); process.exit(1); }

if (isGate) {
  // 闸门模式（CI）
  if (!repo) { console.error('--gate 需要 --repo owner/name'); process.exit(1); }
  const result = runGate(repo, dir, { list: arg('--list') || 'plugin', risk360Path: arg('--risk360') || null });
  console.log(JSON.stringify(result, null, 1));
  process.exit(result.pass ? 0 : 1);
}

if (repo) {
  // 单仓模式
  const [owner, name] = repo.split('/');
  const repoDir = join(dir, 'Plugins', owner, name);
  if (!existsSync(repoDir)) { console.error(`未找到克隆目录: ${repoDir}`); process.exit(1); }
  const verdict = checkRepo(repo, repoDir);
  console.log(JSON.stringify(verdict, null, 1));
  process.exit(0);
}

// 批量模式
const pluginsRoot = join(dir, 'Plugins');
if (!existsSync(pluginsRoot)) { console.error(`未找到 Plugins 目录: ${pluginsRoot}`); process.exit(1); }
const suggestions = {};
const counts = { A: 0, B: 0, C: 0, D: 0 };
const owners = readdirSync(pluginsRoot);
let scanned = 0;
for (const owner of owners) {
  const ownerDir = join(pluginsRoot, owner);
  if (!existsSync(ownerDir)) continue;
  const names = readdirSync(ownerDir).filter(n => {
    const d = join(ownerDir, n);
    return existsSync(join(d, 'package.json')) || existsSync(join(d, '.git')) || existsSync(join(d, 'cordis.patch.yml'));
  });
  for (const name of names) {
    const r = `${owner}/${name}`;
    const verdict = checkRepo(r, join(ownerDir, name));
    suggestions[r] = verdict;
    counts[verdict.level]++;
    scanned++;
  }
}
const outPath = join(dir, 'catalog', 'compat-suggestions.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(suggestions, null, 1));console.log(`扫描 ${scanned} 个仓库 -> ${outPath}`);
console.log('分档统计:', JSON.stringify(counts));
console.log('说明: compat-suggestions.json 中的 compatLabel 即建议写入 intents.json 的 compat 字段值；level 为人工复核优先级。');
}

#!/usr/bin/env node
/**
 * build-readme.mjs — generate the Blue-Whale-Harness README.md from intents.json.
 *
 * Produces a categorized index of every collected DSH plugin repo, links each
 * to its GitHub repo, and links the whole thing to the live site.
 *
 * Run: node build-readme.mjs   (writes ../README.md)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const intents = JSON.parse(readFileSync(join(__dirname, 'intents.json'), 'utf8'))

const clean = s => (s || '').toString().replace(/\r?\n/g, ' ').trim()
const rows = Object.values(intents).map(r => ({
  repo: r.repo,
  url: `https://github.com/${r.repo}`,
  intentZh: clean(r.intentZh || '').slice(0, 90),
  intentEn: clean(r.intentEn || '').slice(0, 90),
  category: r.dshCategory || 'uncategorized',
  isDsh: r.isDshPlugin ? 'yes' : 'no',
  stars: r.stars ?? 0,
  language: r.language || '',
}))
rows.sort((a, b) => b.stars - a.stars)

const total = rows.length
const dshN = rows.filter(r => r.isDsh === 'yes').length
const date = new Date().toISOString().slice(0, 10)

// group by category, sort categories by total stars desc
const byCat = {}
for (const r of rows) (byCat[r.category] ||= []).push(r)
const cats = Object.keys(byCat).sort((a, b) => byCat[b].reduce((s, x) => s + x.stars, 0) - byCat[a].reduce((s, x) => s + x.stars, 0))

const L = []
L.push('# Blue-Whale-Harness')
L.push('')
L.push('> 收录所有自由人脉产生的 DeepSeek Harness（DSH）插件。')
L.push('')
L.push('🌐 **在线总表：[leenkcool.github.io](https://leenkcool.github.io)** — 支持中英文搜索、分类筛选、按 STAR 排序的交互式目录。')
L.push('')
L.push(`> 自动生成于 ${date} ｜ 共 **${total}** 个仓库 ｜ 真·DSH 插件 **${dshN}** 个`)
L.push('')
L.push('🛒 **买AI，买VPS都上 [AIVPS开源采购网](https://aivps.github.io/)）**')
L.push('')
L.push('## 统计')
L.push('')
L.push(`- 仓库总数：**${total}**`)
L.push(`- 真·DSH 插件：**${dshN}**`)
L.push(`- 在线浏览：https://leenkcool.github.io （[中文版](https://leenkcool.github.io/plugins.zh.html) ｜ [English](https://leenkcool.github.io/plugins.en.html) ｜ [CSV 数据](https://leenkcool.github.io/plugins.csv)）`)
L.push('')
L.push('## 分类索引')
L.push('')
for (const c of cats) {
  const n = byCat[c].length
  const st = byCat[c].reduce((s, x) => s + x.stars, 0)
  L.push(`- **${c}** — ${n} 个仓库，★${st}`)
}
L.push('')
L.push('## 插件清单')
L.push('')
L.push('> 按分类分组，组内按 STAR 倒序。点击仓库名跳转原项目。')
L.push('')
for (const c of cats) {
  L.push(`### ${c}（${byCat[c].length}）`)
  L.push('')
  L.push('| 仓库 | 意图(中文) | Intent(English) | STAR | 语言 | 真DSH |')
  L.push('|---|---|---|---|---|---|')
  for (const r of byCat[c]) {
    L.push(`| [${r.repo}](${r.url}) | ${r.intentZh} | ${r.intentEn} | ${r.stars} | ${r.language} | ${r.isDsh} |`)
  }
  L.push('')
}
L.push('## 如何生成 / 更新')
L.push('')
L.push('```bash')
L.push('node catalog/analyze.mjs     # 采集仓库元数据 + 意图（HY3 直译）')
L.push('node catalog/merge.mjs       # 套用人工翻译')
L.push('node catalog/generate.mjs    # 生成 catalog/index.html 等网站产物')
L.push('node catalog/build-readme.mjs # 重新生成本 README')
L.push('```')
L.push('')
L.push('生成的网站产物部署到 [leenkcool.github.io](https://github.com/leenkcool/leenkcool.github.io)。')
L.push('')
L.push('## License')
L.push('')
L.push('插件清单索引按 Apache-2.0 收集整理；各插件版权归原作者所有。')
L.push('')
L.push('---')
L.push('')
L.push('🛒 买AI，买VPS都上 [AIVPS开源采购网](https://aivps.github.io/)）')

writeFileSync(join(ROOT, 'README.md'), L.join('\n') + '\n')
console.log(`README written: ${total} repos, ${cats.length} categories -> ${join(ROOT, 'README.md')}`)

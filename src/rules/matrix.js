// 处理层/判定层交界：证据矩阵纯派生函数
// 给定文献与编码，构建以文献为行的证据矩阵（不修改入参）

import { canonicalPages } from './pages.js';
import { directionSymbol } from '../data/constants.js';

// 防御性自检：同文献同页重复（正常流程不应出现，存储层异常时暴露）
export function findDuplicateCodes(codes) {
  const seen = new Map();
  for (const c of codes) {
    for (const page of c.pages || []) {
      const key = `${c.paperId}:${page}`;
      if (seen.has(key)) return { key, codeId: c.id, firstRow: seen.get(key) };
      seen.set(key, c.id);
    }
  }
  return null;
}

// 返回 { rows, stats }；rows 一篇文献一行（含无编码的文献，eligible=false）
export function buildMatrix(papers, codes) {
  const rows = papers.map((p) => {
    const cs = codes.filter((c) => c.paperId === p.id).sort((a, b) => a.id - b.id);
    const dirs = [...new Set(cs.map((c) => c.direction))];
    const conflict = dirs.length > 1;
    const unexplainedConflict =
      conflict && cs.some((c) => !(c.divergence && c.divergence.trim()));
    const allPages = new Set();
    cs.forEach((c) => c.pages.forEach((pg) => allPages.add(pg)));
    return {
      paperId: p.id,
      title: p.title,
      authors: p.authors,
      year: p.year,
      cite: p.cite,
      codeCount: cs.length,
      eligible: cs.length > 0,
      designs: [...new Set(cs.map((c) => c.design))],
      sampleSizeTotal: cs.reduce((s, c) => s + c.sampleSize, 0),
      directions: dirs,
      conflict,
      unexplainedConflict,
      divergences: [...new Set(cs.map((c) => c.divergence).filter(Boolean))],
      pageKeys: [...allPages].map(Number).sort((a, b) => a - b).map(String),
      pagesText: canonicalPages(allPages),
      codes: cs,
    };
  });

  const eligible = rows.filter((r) => r.eligible);
  const stats = {
    papers: papers.length,
    coded: eligible.length,
    uncoded: rows.length - eligible.length,
    codes: codes.length,
    samplePool: eligible.reduce((s, r) => s + r.sampleSizeTotal, 0),
    conflicts: eligible.filter((r) => r.conflict).length,
    directionCounts: {
      positive: eligible.filter((r) => r.directions.includes('positive')).length,
      negative: eligible.filter((r) => r.directions.includes('negative')).length,
      null: eligible.filter((r) => r.directions.includes('null')).length,
      mixed: eligible.filter((r) => r.directions.includes('mixed')).length,
    },
  };
  return { rows, stats };
}

export const dirSym = directionSymbol;

// 判定层：批次校验（事务性 —— 任一错误则整批拒绝）
// 纳入编码必须登记：研究设计、样本量、效应方向、证据页码，缺任一项不能进入合并。
// 效应方向冲突须写分歧说明；同一文献同一页不得重复编码。

import { RESEARCH_DESIGNS, EFFECT_DIRECTIONS } from '../data/constants.js';
import { parsePages } from './pages.js';

export const ERROR = {
  MISSING_PAPER: 'MISSING_PAPER',
  MISSING_FIELD: 'MISSING_FIELD',
  BAD_DESIGN: 'BAD_DESIGN',
  BAD_SAMPLE: 'BAD_SAMPLE',
  BAD_DIRECTION: 'BAD_DIRECTION',
  BAD_PAGES: 'BAD_PAGES',
  DUPLICATE_BATCH: 'DUPLICATE_BATCH',
  DUPLICATE_STORED: 'DUPLICATE_STORED',
  CONFLICT: 'CONFLICT',
};

const FIELD_NAME = {
  design: '研究设计',
  sampleSize: '样本量',
  direction: '效应方向',
  pages: '证据页码',
};

// row: {rowId, paperId, design, sampleSize, direction, pages, divergence, effectText}
// papers: 已有文献；storedCodes: 库内已有编码
// 返回 { ok, errors:[{...}], parsed:[规范化后的候选编码...] }
export function validateBatch(rows, papers, storedCodes) {
  const errors = [];
  const parsed = [];
  const paperById = new Map(papers.map((p) => [p.id, p]));
  const validDesigns = new Set(RESEARCH_DESIGNS.map((d) => d.value));
  const validDirs = new Set(EFFECT_DIRECTIONS.map((d) => d.value));
  const titleOf = (id) => paperById.get(id)?.title || `#${id}`;

  // 第一遍：逐行完整性 / 取值校验，并解析页码
  rows.forEach((row, index) => {
    const rowNo = index + 1;
    const push = (field, code, message, original) =>
      errors.push({ rowNo, field, code, message, original, title: row.paperId ? titleOf(row.paperId) : '（未选文献）' });

    if (!row.paperId) {
      push('paperId', ERROR.MISSING_PAPER, '未选择文献，无法登记编码', row.paperId);
      return; // 缺文献的行无法参与后续判定
    }

    const missing = ['design', 'sampleSize', 'direction', 'pages'].filter((f) => {
      const v = row[f];
      return v === undefined || v === null || String(v).trim() === '';
    });
    if (missing.length) {
      missing.forEach((f) =>
        push(f, ERROR.MISSING_FIELD, `缺少必填项：${FIELD_NAME[f]}；缺任一项不能进入合并`, row[f])
      );
    }

    let okDesign = false;
    if (!missing.includes('design')) {
      okDesign = validDesigns.has(row.design);
      if (!okDesign) push('design', ERROR.BAD_DESIGN, '研究设计不在受控词表中', row.design);
    }

    let okSample = false;
    if (!missing.includes('sampleSize')) {
      const n = Number(row.sampleSize);
      okSample = Number.isInteger(n) && n >= 10;
      if (!okSample)
        push('sampleSize', ERROR.BAD_SAMPLE, '样本量须为不小于 10 的整数', row.sampleSize);
    }

    let okDirection = false;
    if (!missing.includes('direction')) {
      okDirection = validDirs.has(row.direction);
      if (!okDirection) push('direction', ERROR.BAD_DIRECTION, '效应方向不在受控词表中', row.direction);
    }

    let pageKeys = null;
    if (!missing.includes('pages')) {
      const { keys, invalidTokens } = parsePages(row.pages);
      if (invalidTokens.length || keys.length === 0) {
        push(
          'pages',
          ERROR.BAD_PAGES,
          `证据页码无法解析：${invalidTokens.join('；') || '空'}（允许如 12、12-15、12, 18）`,
          row.pages
        );
      } else {
        pageKeys = keys;
      }
    }

    // 只有本批数据自身完整合法，才进入候选集并参与查重/冲突判定
    const rowComplete = missing.length === 0 && okDesign && okSample && okDirection && pageKeys;
    if (rowComplete) {
      parsed.push({
        rowNo,
        rowId: row.rowId,
        paperId: row.paperId,
        design: row.design,
        sampleSize: Number(row.sampleSize),
        direction: row.direction,
        pages: pageKeys,
        pagesText: row.pages,
        divergence: (row.divergence || '').trim(),
        effectText: (row.effectText || '').trim(),
      });
    }
  });

  // 第二遍：同一文献同一页不得重复编码（批内）
  const seenInBatch = new Map(); // paperId:page -> 首次行号
  for (const c of parsed) {
    for (const page of c.pages) {
      const key = `${c.paperId}:${page}`;
      if (seenInBatch.has(key)) {
        errors.push({
          rowNo: c.rowNo,
          field: 'pages',
          code: ERROR.DUPLICATE_BATCH,
          message: `同一文献第 ${page} 页在本批第 ${seenInBatch.get(key)} 行已编码，同页不得重复编码`,
          original: c.pagesText,
          title: titleOf(c.paperId),
          page: String(page),
        });
      } else {
        seenInBatch.set(key, c.rowNo);
      }
    }
  }

  // 第二遍：同一文献同一页不得重复编码（与库内已登记编码）
  const storedByPaper = new Map();
  for (const code of storedCodes) {
    if (!storedByPaper.has(code.paperId)) storedByPaper.set(code.paperId, []);
    storedByPaper.get(code.paperId).push(code);
  }
  for (const c of parsed) {
    const existing = storedByPaper.get(c.paperId) || [];
    for (const page of c.pages) {
      const hit = existing.find((e) => e.pages.includes(page));
      if (hit) {
        errors.push({
          rowNo: c.rowNo,
          field: 'pages',
          code: ERROR.DUPLICATE_STORED,
          message: `同一文献第 ${page} 页已有登记编码（编码 #${hit.id}），同页不得重复编码`,
          original: c.pagesText,
          title: titleOf(c.paperId),
          page: String(page),
        });
      }
    }
  }

  // 第三遍：效应方向冲突须写分歧说明
  // 合并「库内方向」与「本批行方向」逐文献比对；冲突行若无分歧说明即拒绝
  for (const c of parsed) {
    const dirs = new Set((storedByPaper.get(c.paperId) || []).map((e) => e.direction));
    parsed
      .filter((o) => o.paperId === c.paperId)
      .forEach((o) => dirs.add(o.direction));
    dirs.delete(null);
    if (dirs.size > 1 && !c.divergence) {
      errors.push({
        rowNo: c.rowNo,
        field: 'divergence',
        code: ERROR.CONFLICT,
        message: `《${titleOf(c.paperId)}》存在效应方向冲突（${[...dirs].join(' / ')}），须填写分歧说明`,
        original: c.direction,
        title: titleOf(c.paperId),
      });
    }
  }

  if (errors.length) return { ok: false, errors, parsed: [] };
  return { ok: true, errors: [], parsed };
}

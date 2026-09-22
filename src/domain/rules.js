// 判定层 · 编码校验、重复检测、效应冲突与整批拒绝
// 纯函数：输入数据，输出判定结果，不触碰存储与 DOM

import { DESIGNS, EFFECTS } from './constants.js';

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * 校验单条编码：研究设计、样本量、效应方向、证据页码缺一不可
 * 返回 { ok, errors:[{field, reason, value}] }
 */
export function validateCoding(c) {
  const errors = [];
  if (isBlank(c?.studyDesign)) {
    errors.push({ field: 'studyDesign', reason: '缺少研究设计', value: c?.studyDesign ?? '' });
  } else if (!DESIGNS.includes(c.studyDesign)) {
    errors.push({ field: 'studyDesign', reason: `研究设计不在受控词表：${c.studyDesign}`, value: c.studyDesign });
  }
  if (isBlank(c?.sampleSize)) {
    errors.push({ field: 'sampleSize', reason: '缺少样本量', value: c?.sampleSize ?? '' });
  } else {
    const n = Number(c.sampleSize);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      errors.push({ field: 'sampleSize', reason: `样本量须为正整数，原值：${c.sampleSize}`, value: c.sampleSize });
    }
  }
  if (isBlank(c?.effectDirection)) {
    errors.push({ field: 'effectDirection', reason: '缺少效应方向', value: c?.effectDirection ?? '' });
  } else if (!EFFECTS.includes(c.effectDirection)) {
    errors.push({ field: 'effectDirection', reason: `效应方向不在受控词表：${c.effectDirection}`, value: c.effectDirection });
  }
  if (isBlank(c?.evidencePage)) {
    errors.push({ field: 'evidencePage', reason: '缺少证据页码', value: c?.evidencePage ?? '' });
  } else if (!/^\d+\s*(-\s*\d+)?$/.test(String(c.evidencePage).trim())) {
    errors.push({ field: 'evidencePage', reason: `证据页码格式应为数字或起-止页，原值：${c.evidencePage}`, value: c.evidencePage });
  }
  return { ok: errors.length === 0, errors };
}

/** 同文献同页归一化：12 与 "12" 视为同页；区间页按首页去重 */
export function pageKey(page) {
  const m = String(page).replace(/\s+/g, '').match(/^(\d+)(?:-(\d+))?$/);
  return m ? m[1] : String(page).trim();
}

/**
 * 同一文献同一页不得重复编码
 * 返回重复对数组 [{paperId, title, page, rows:[{row, coding}]}]
 */
export function findDuplicateCodings(papers) {
  const dups = [];
  for (const p of papers) {
    const map = new Map();
    for (const c of p.codings || []) {
      const k = pageKey(c.evidencePage);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    }
    for (const [page, rows] of map) {
      if (rows.length > 1) {
        dups.push({ paperId: p.id, title: p.title, page, rows });
      }
    }
  }
  return dups;
}

/**
 * 同一文献内效应方向冲突（纳入合并的完整编码之间）
 * 阳性/阴性 互相对立即冲突；无效应与阳性/阴性并存提示分歧；混合直接要求说明
 * 返回 [{paperId, title, directions:['阳性','阴性']}]
 */
export function findEffectConflicts(papers) {
  const conflicts = [];
  for (const p of papers) {
    const complete = (p.codings || []).filter((c) => validateCoding(c).ok);
    const dirs = [...new Set(complete.map((c) => c.effectDirection))];
    const clash =
      dirs.includes('混合') ||
      (dirs.includes('阳性') && dirs.includes('阴性')) ||
      ((dirs.includes('阳性') || dirs.includes('阴性')) && dirs.includes('无效应'));
    if (clash) {
      conflicts.push({
        paperId: p.id,
        title: p.title,
        directions: dirs,
        pages: complete.map((c) => c.evidencePage),
      });
    }
  }
  return conflicts;
}

/** 分歧说明是否齐备：每个存在方向冲突的文献都必须有非空 disagreement 说明 */
export function findUnexplainedConflicts(papers) {
  return findEffectConflicts(papers).filter(
    (x) => isBlank(papers.find((p) => p.id === x.paperId)?.disagreement),
  );
}

/**
 * 合并资格总判定（冻结前调用）
 * 任一问题存在即整批拒绝，拒绝清单列出篇名、页码与原值
 * @returns {{eligible:boolean, issues:Array}}
 */
export function evaluateBatch(papers) {
  const issues = [];

  for (const p of papers) {
    (p.codings || []).forEach((c, idx) => {
      const r = validateCoding(c);
      if (!r.ok) {
        r.errors.forEach((e) =>
          issues.push({
            kind: '缺项/格式',
            title: p.title,
            page: c.evidencePage === undefined || c.evidencePage === '' ? '（未填页码）' : c.evidencePage,
            field: e.field,
            original: e.value === '' ? '（空）' : e.value,
            reason: e.reason,
            row: idx + 1,
          }),
        );
      }
    });
  }

  for (const d of findDuplicateCodings(papers)) {
    d.rows.forEach((c, i) =>
      issues.push({
        kind: '重复编码',
        title: d.title,
        page: c.evidencePage,
        field: 'evidencePage',
        original: `${c.studyDesign || '（缺）'} / N=${c.sampleSize ?? '（缺）'} / ${c.effectDirection || '（缺）'}`,
        reason: `同一文献第 ${d.page} 页存在 ${d.rows.length} 条编码（第 ${i + 1} 条）`,
      }),
    );
  }

  for (const x of findUnexplainedConflicts(papers)) {
    issues.push({
      kind: '效应冲突未说明',
      title: x.title,
      page: x.pages.join('、'),
      field: 'disagreement',
      original: x.directions.join(' / '),
      reason: `第 ${x.pages.join('、')} 页效应方向并存：${x.directions.join('、')}，须补写分歧说明`,
    });
  }

  return { eligible: issues.length === 0, issues };
}

/** 证据矩阵：仅汇总字段完整、通过全部规则的编码 */
export function buildMatrix(papers) {
  const rows = [];
  for (const p of papers) {
    for (const c of p.codings || []) {
      if (!validateCoding(c).ok) continue;
      rows.push({
        paperId: p.id,
        title: p.title,
        authors: p.authors,
        year: p.year,
        studyDesign: c.studyDesign,
        sampleSize: Number(c.sampleSize),
        effectDirection: c.effectDirection,
        evidencePage: c.evidencePage,
        finding: c.finding || '',
        disagreement: p.disagreement || '',
      });
    }
  }
  const tally = EFFECTS.reduce((acc, d) => {
    acc[d] = rows.filter((r) => r.effectDirection === d).length;
    return acc;
  }, {});
  return {
    rows,
    total: rows.length,
    papers: new Set(rows.map((r) => r.paperId)).size,
    tally,
  };
}

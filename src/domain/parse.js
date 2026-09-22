// 数据处理层 · 批量导入解析
// 仅负责文本 → 结构化记录与受控词表归一化，不做资格判定

import { DESIGN_ALIASES, EFFECT_ALIASES } from './constants.js';

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[\s_]+/g, ' ');

export function normalizeDesign(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return { value: '', known: false, raw };
  const hit = DESIGN_ALIASES[norm(raw)] ?? DESIGN_ALIASES[raw];
  return hit ? { value: hit, known: true, raw } : { value: raw, known: false, raw };
}

export function normalizeEffect(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return { value: '', known: false, raw };
  const hit = EFFECT_ALIASES[norm(raw)] ?? EFFECT_ALIASES[raw];
  return hit ? { value: hit, known: true, raw } : { value: raw, known: false, raw };
}

/** 解析一行 CSV（支持双引号包裹与引号转义） */
function splitLine(line, sep) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const HEADER_MAP = {
  标题: 'title',
  文献标题: 'title',
  title: 'title',
  题名: 'title',
  作者: 'authors',
  authors: 'authors',
  author: 'authors',
  年份: 'year',
  year: 'year',
  出版物: 'venue',
  venue: 'venue',
  source: 'venue',
  研究设计: 'studyDesign',
  设计: 'studyDesign',
  design: 'studyDesign',
  study: 'studyDesign',
  样本量: 'sampleSize',
  样本: 'sampleSize',
  n: 'sampleSize',
  'n(样本量)': 'sampleSize',
  samplesize: 'sampleSize',
  效应方向: 'effectDirection',
  方向: 'effectDirection',
  effect: 'effectDirection',
  direction: 'effectDirection',
  证据页码: 'evidencePage',
  页码: 'evidencePage',
  page: 'evidencePage',
  pages: 'evidencePage',
  发现: 'finding',
  结论摘录: 'finding',
  findings: 'finding',
  finding: 'finding',
  notes: 'finding',
};

/**
 * 解析批量文本（首行表头，自动识别 Tab / 逗号 / 分号分隔）
 * @returns {{records:Array, parseErrors:Array, header:Array}}
 */
export function parseBatch(text) {
  const rawLines = String(text)
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  if (rawLines.length < 2) {
    return { records: [], parseErrors: [{ line: 0, reason: '需要表头行与至少一条数据行' }], header: [] };
  }
  const first = rawLines[0];
  const sep = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';
  const header = splitLine(first, sep).map((h) => HEADER_MAP[norm(h)] || null);

  if (!header.includes('title')) {
    return {
      records: [],
      parseErrors: [{ line: 1, reason: '表头缺少“标题/title”列', raw: rawLines[0] }],
      header: splitLine(first, sep),
    };
  }

  const records = [];
  const parseErrors = [];
  rawLines.slice(1).forEach((line, i) => {
    const cells = splitLine(line, sep);
    const rec = { _line: i + 2, _warnings: [] };
    header.forEach((key, idx) => {
      if (!key) return;
      rec[key] = cells[idx] ?? '';
    });
    if (!rec.title) {
      parseErrors.push({ line: i + 2, reason: '篇名为空', raw: line });
      return;
    }
    if (rec.studyDesign) {
      const d = normalizeDesign(rec.studyDesign);
      if (!d.known) rec._warnings.push(`研究设计原值“${d.raw}”不在受控词表`);
      rec.studyDesign = d.value;
    }
    if (rec.effectDirection) {
      const e = normalizeEffect(rec.effectDirection);
      if (!e.known) rec._warnings.push(`效应方向原值“${e.raw}”无法识别`);
      rec.effectDirection = e.value;
    }
    if (rec.year) rec.year = Number(rec.year) || rec.year;
    records.push(rec);
  });

  return { records, parseErrors, header: splitLine(first, sep) };
}

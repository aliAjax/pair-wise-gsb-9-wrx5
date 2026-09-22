// 数据层：本地存储（单一持久化键，原子写入；旧版研究文献库自动迁移）

import { seedPapers } from './seed.js';
import { MATRIX_STATUS } from './constants.js';

export const STORAGE_KEY = 'evidence-matrix-v1';
const LEGACY_KEY = 'research-library';

export function initialState() {
  return {
    papers: seedPapers,
    codes: [], // {id, paperId, design, sampleSize, direction, pages:[页键], pagesText, divergence, effectText, createdAt}
    status: MATRIX_STATUS.DRAFT,
    versions: [], // 冻结快照 [{version, type, reason, createdAt, papers, codes}]
    seq: { paper: 100, code: 1, version: 0 },
  };
}

function migrateLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const old = JSON.parse(raw);
      if (Array.isArray(old) && old.length) {
        const base = initialState();
        return {
          ...base,
          papers: old.map((p) => ({
            id: p.id,
            title: p.title,
            authors: p.authors || '',
            year: p.year || null,
            venue: p.venue || '',
            tags: Array.isArray(p.tags) ? p.tags : [],
            abstract: p.abstract || '',
            status: p.status || '待读',
            cite: p.cite || '',
            notes: p.notes || '',
          })),
        };
      }
    }
  } catch {
    /* 旧数据损坏则回退种子库 */
  }
  return null;
}

function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.papers) || !Array.isArray(raw.codes) || !Array.isArray(raw.versions))
    return null;
  const status = raw.status === MATRIX_STATUS.FROZEN ? MATRIX_STATUS.FROZEN : MATRIX_STATUS.DRAFT;
  return {
    papers: raw.papers,
    codes: raw.codes.map((c) => ({ ...c, pages: Array.isArray(c.pages) ? c.pages : [] })),
    status,
    versions: raw.versions,
    seq: {
      paper: raw.seq?.paper || Math.max(100, ...raw.papers.map((p) => Number(p.id) || 0)) + 1,
      code: raw.seq?.code || Math.max(0, ...raw.codes.map((c) => Number(c.id) || 0)) + 1,
      version: raw.seq?.version || raw.versions.length,
    },
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const clean = sanitize(JSON.parse(raw));
      if (clean) return clean;
    }
    const migrated = migrateLegacy();
    if (migrated) return migrated;
  } catch {
    /* fall through */
  }
  return initialState();
}

// 原子写入：文献、编码、矩阵状态、版本同处一个 JSON —— 刷新后四者必然一致
export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 存储层 · 状态持久化、冻结/版本/撤回、完整性校验
// 不包含判定口径（调用 domain/rules），不触碰界面

import { STORAGE_KEY, LEGACY_KEY, SCHEMA_VERSION } from '../domain/constants.js';
import { evaluateBatch, buildMatrix } from '../domain/rules.js';

const clone = (x) =>
  typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x));

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const seedPapers = [
  {
    id: 'p-extended-mind',
    title: 'The Extended Mind',
    authors: 'Clark, A. & Chalmers, D.',
    year: 1998,
    venue: 'Analysis',
    tags: ['具身认知', '经典'],
    abstract: '本文提出心智延展论：当外部环境稳定地承担认知功能时，心智边界可以超越头脑与身体。',
    status: '阅读中',
    cite: 'Clark, A. & Chalmers, D. (1998). The Extended Mind. Analysis.',
    notes: '',
    disagreement: '',
    codings: [],
  },
  {
    id: 'p-situated-learning',
    title: 'Situated Learning',
    authors: 'Lave, J. & Wenger, E.',
    year: 1991,
    venue: 'Cambridge University Press',
    tags: ['学习科学', '社会'],
    abstract: '学习发生在真实情境的参与过程中，知识与共同体实践不可分割。',
    status: '待读',
    cite: 'Lave, J. & Wenger, E. (1991). Situated Learning.',
    notes: '',
    disagreement: '',
    codings: [],
  },
  {
    id: 'p-designing-with-data',
    title: 'Designing with Data',
    authors: 'Miller, S.',
    year: 2022,
    venue: 'MIT Press',
    tags: ['设计研究', '方法'],
    abstract: '一套面向设计师的数据研究方法，讨论如何把定性洞察转化为可行动的设计决策。',
    status: '已读',
    cite: 'Miller, S. (2022). Designing with Data.',
    notes: '',
    disagreement: '',
    codings: [],
  },
];

/** 旧版 research-library 数据一次性迁移为带编码结构的文献 */
function migrateLegacy() {
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY));
    if (!Array.isArray(old) || !old.length) return null;
    return old.map((p) => ({
      id: uid(),
      title: p.title || '（无标题）',
      authors: p.authors || '',
      year: p.year || '',
      venue: p.venue || '',
      tags: Array.isArray(p.tags) ? p.tags : [],
      abstract: p.abstract || '',
      status: p.status || '待读',
      cite: p.cite || '',
      notes: p.notes || '',
      disagreement: '',
      codings: [],
    }));
  } catch {
    return null;
  }
}

function initialState() {
  const papers = migrateLegacy() || seedPapers;
  return {
    schema: SCHEMA_VERSION,
    papers,
    // 已冻结版本（不可变快照），按版本号升序
    versions: [],
    // null = 当前处于最近冻结版（只读）；对象 = 正在调整中的草稿版本
    draft: {
      version: 1,
      baseVersion: 0,
      reason: '',
      startedAt: null,
      audit: [],
    },
  };
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const s = JSON.parse(raw);
    if (!s || s.schema !== SCHEMA_VERSION || !Array.isArray(s.papers)) return initialState();
    s.versions = Array.isArray(s.versions) ? s.versions : [];
    if (!s.draft) s.draft = { version: 1, baseVersion: 0, reason: '', startedAt: null, audit: [] };
    return s;
  } catch {
    return initialState();
  }
}

/** 刷新后一致性校验：冻结快照必须仍能重算出同样的矩阵 */
export function integrityCheck(state) {
  const report = [];
  for (const v of state.versions) {
    const m = buildMatrix(v.snapshot);
    const ok =
      m.total === v.summary.total &&
      m.papers === v.summary.papers &&
      JSON.stringify(m.tally) === JSON.stringify(v.summary.tally);
    if (!ok) {
      report.push({
        version: v.version,
        reason: `快照矩阵不一致（记录 ${m.total}/${v.summary.total} 条，文献 ${m.papers}/${v.summary.papers} 篇）`,
      });
    }
  }
  const live = buildMatrix(state.papers);
  return {
    ok: report.length === 0,
    versionReports: report,
    liveRows: live.total,
    checkedAt: new Date().toISOString(),
  };
}

/** 把解析后的记录合并进文献数组（纯函数，供预检与正式导入共用） */
export function mergeRecords(papers, records) {
  const out = papers.map((p) => ({ ...p, codings: [...p.codings] }));
  for (const r of records) {
    const coding = {
      id: uid(),
      studyDesign: r.studyDesign || '',
      sampleSize:
        r.sampleSize === '' || r.sampleSize === undefined
          ? ''
          : Number(r.sampleSize) || r.sampleSize,
      effectDirection: r.effectDirection || '',
      evidencePage: r.evidencePage ? String(r.evidencePage).replace(/\s+/g, '') : '',
      finding: r.finding || '',
    };
    const exist = out.find(
      (p) => p.title.trim() === r.title.trim() && String(p.year) === String(r.year ?? ''),
    );
    if (exist) {
      exist.codings.push(coding);
    } else {
      out.push({
        id: uid(),
        title: r.title,
        authors: r.authors || '',
        year: r.year || '',
        venue: r.venue || '',
        tags: [],
        abstract: '',
        status: '待读',
        cite: `${r.authors || ''} (${r.year || ''}). ${r.title}. ${r.venue || ''}`.trim(),
        notes: '',
        disagreement: '',
        codings: [coding],
      });
    }
  }
  return out;
}

// ---- 极简 store（useSyncExternalStore 兼容）----
let state = loadRaw();
const listeners = new Set();
let integrity = integrityCheck(state);

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  integrity = integrityCheck(state);
  listeners.forEach((fn) => fn());
}

export const store = {
  getState: () => state,
  get integrity() {
    return integrity;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  isFrozen() {
    return state.draft === null;
  },

  latestVersion() {
    return state.versions.length ? state.versions[state.versions.length - 1].version : 0;
  },

  /** 冻结矩阵：不合格则整批拒绝并返回问题清单，不产生任何写入 */
  freeze() {
    const verdict = evaluateBatch(state.papers);
    if (!verdict.eligible) return { ok: false, ...verdict };
    const matrix = buildMatrix(state.papers);
    const version = state.draft ? state.draft.version : this.latestVersion() + 1;
    const snap = {
      version,
      frozenAt: new Date().toISOString(),
      snapshot: clone(state.papers),
      summary: { total: matrix.total, papers: matrix.papers, tally: matrix.tally },
      reason: state.draft?.reason || '首次冻结',
      audit: state.draft?.audit || [],
    };
    state = { ...state, versions: [...state.versions, snap], draft: null };
    persist();
    return { ok: true, version, matrix };
  },

  /** 冻结后调整：必须填写原因，开启新版本草稿（基于最近冻结版） */
  startAdjustment(reason) {
    const r = String(reason || '').trim();
    if (!r) return { ok: false, error: '调整必须填写原因' };
    if (state.draft) return { ok: false, error: '已有进行中的调整版本，请先冻结或撤回' };
    if (!state.versions.length) return { ok: false, error: '矩阵尚未冻结，无需新建版本' };
    const base = state.versions[state.versions.length - 1];
    state = {
      ...state,
      papers: clone(base.snapshot),
      draft: {
        version: base.version + 1,
        baseVersion: base.version,
        reason: r,
        startedAt: new Date().toISOString(),
        audit: [],
      },
    };
    persist();
    return { ok: true, version: state.draft.version };
  },

  /** 撤回：仅回到最近冻结版，丢弃当前草稿的全部调整 */
  withdraw(reason) {
    if (!state.draft) return { ok: false, error: '当前不在调整版本中，无可撤回内容' };
    if (!state.versions.length) return { ok: false, error: '不存在冻结版' };
    const base = state.versions[state.versions.length - 1];
    state = { ...state, papers: clone(base.snapshot), draft: null };
    persist();
    return { ok: true, version: base.version, withdrawnAt: new Date().toISOString() };
  },

  _assertEditable(action, reason) {
    if (!state.draft) throw new Error('矩阵已冻结：编码只读，须先「带原因新建版本」');
    const isAdjustment = state.draft.baseVersion > 0;
    if (isAdjustment && action !== 'paper-meta' && action !== 'add-paper') {
      if (!String(reason || '').trim()) throw new Error('冻结后的调整必须随操作登记原因');
    }
  },

  _log(entry) {
    state.draft.audit.push({ at: new Date().toISOString(), ...entry });
  },

  addPaper(data) {
    this._assertEditable('add-paper');
    const paper = {
      id: uid(),
      title: data.title || '（无标题）',
      authors: data.authors || '',
      year: data.year || '',
      venue: data.venue || '',
      tags: data.tags || [],
      abstract: data.abstract || '',
      status: data.status || '待读',
      cite: data.cite || `${data.authors || ''} (${data.year || ''}). ${data.title || ''}.`,
      notes: '',
      disagreement: '',
      codings: [],
    };
    state = { ...state, papers: [...state.papers, paper] };
    persist();
    return paper;
  },

  addCoding(paperId, coding, reason) {
    this._assertEditable('coding', reason);
    const papers = state.papers.map((p) =>
      p.id === paperId ? { ...p, codings: [...p.codings, { id: uid(), ...coding }] } : p,
    );
    state = { ...state, papers };
    this._log({ action: '新增编码', paperId, page: coding.evidencePage, reason });
    persist();
  },

  updateCoding(paperId, codingId, patch, reason) {
    this._assertEditable('coding', reason);
    const before = state.papers
      .find((p) => p.id === paperId)
      ?.codings.find((c) => c.id === codingId);
    const papers = state.papers.map((p) =>
      p.id === paperId
        ? {
            ...p,
            codings: p.codings.map((c) => (c.id === codingId ? { ...c, ...patch } : c)),
          }
        : p,
    );
    state = { ...state, papers };
    this._log({
      action: '修改编码',
      paperId,
      codingId,
      page: (patch.evidencePage ?? before?.evidencePage) || '',
      before: before ? clone(before) : null,
      after: patch,
      reason,
    });
    persist();
  },

  removeCoding(paperId, codingId, reason) {
    this._assertEditable('coding', reason);
    const papers = state.papers.map((p) =>
      p.id === paperId ? { ...p, codings: p.codings.filter((c) => c.id !== codingId) } : p,
    );
    state = { ...state, papers };
    this._log({ action: '删除编码', paperId, codingId, reason });
    persist();
  },

  setDisagreement(paperId, text, reason) {
    this._assertEditable('disagreement', reason);
    state = {
      ...state,
      papers: state.papers.map((p) => (p.id === paperId ? { ...p, disagreement: text } : p)),
    };
    this._log({ action: '填写分歧说明', paperId, reason });
    persist();
  },

  updatePaperMeta(paperId, patch) {
    this._assertEditable('paper-meta');
    state = {
      ...state,
      papers: state.papers.map((p) => (p.id === paperId ? { ...p, ...patch } : p)),
    };
    persist();
  },

  /** 批量导入：仅允许在可编辑状态；解析层已归一化，这里按“标题+年份”合并去重 */
  importRecords(records, reason) {
    this._assertEditable('import', reason);
    const papers = mergeRecords(state.papers, records);
    const added = records.filter(
      (r) =>
        !state.papers.some(
          (p) => p.title.trim() === r.title.trim() && String(p.year) === String(r.year ?? ''),
        ),
    ).length;
    state = { ...state, papers };
    this._log({ action: '批量导入', added, merged: records.length - added, reason });
    persist();
    return { added, merged: records.length - added };
  },
};

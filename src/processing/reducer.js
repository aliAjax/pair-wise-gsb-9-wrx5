// 处理层：纯 reducer（与 React 解耦，可单测）
// 所有状态变更集中于此；守卫未通过的动作原样返回，由界面层提示原因。

import { MATRIX_STATUS, VERSION_TYPE } from '../data/constants.js';
import { validateBatch } from '../rules/validate.js';
import { canFreeze, guardWritable, canAdjust, canWithdraw, latestFrozen } from '../rules/guards.js';
import { findDuplicateCodes } from '../rules/matrix.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

export function reducer(state, action) {
  switch (action.type) {
    // ---------- 文献管理（任何状态都允许元数据维护） ----------
    case 'paper/add': {
      const id = state.seq.paper + 1;
      const { title, authors, year, venue, abstract, tags } = action.payload;
      return {
        ...state,
        seq: { ...state.seq, paper: id },
        papers: [
          ...state.papers,
          {
            id,
            title,
            authors,
            year: year ? Number(year) : null,
            venue: venue || '',
            tags,
            abstract: abstract || '',
            status: '待读',
            cite: `${authors} (${year || 'n.d.'}). ${title}. ${venue || ''}`,
          },
        ],
      };
    }

    case 'paper/update': {
      return {
        ...state,
        papers: state.papers.map((p) =>
          p.id === action.payload.id ? { ...p, ...action.payload.patch } : p
        ),
      };
    }

    // ---------- 批次登记：事务性提交，错误整批拒绝 ----------
    case 'code/submitBatch': {
      const guard = guardWritable(state);
      if (!guard.ok) return state;
      const result = validateBatch(action.payload.rows, state.papers, state.codes);
      if (!result.ok) return state; // 界面层另行调用 validateBatch 取得错误清单
      let codeSeq = state.seq.code;
      const newCodes = result.parsed.map((c) => ({
        id: ++codeSeq,
        paperId: c.paperId,
        design: c.design,
        sampleSize: c.sampleSize,
        direction: c.direction,
        pages: c.pages,
        pagesText: c.pagesText,
        divergence: c.divergence,
        effectText: c.effectText,
        createdAt: Date.now(),
      }));
      return {
        ...state,
        seq: { ...state.seq, code: codeSeq },
        codes: [...state.codes, ...newCodes],
      };
    }

    case 'code/delete': {
      const guard = guardWritable(state);
      if (!guard.ok) return state;
      return { ...state, codes: state.codes.filter((c) => c.id !== action.payload.id) };
    }

    // ---------- 冻结 ----------
    case 'matrix/freeze': {
      const check = canFreeze(state);
      if (!check.ok) return state;
      const version = state.seq.version + 1;
      const snapshot = {
        version,
        type: VERSION_TYPE.FREEZE,
        reason: action.payload?.reason?.trim() || '冻结证据矩阵',
        createdAt: Date.now(),
        papers: clone(state.papers),
        codes: clone(state.codes),
      };
      return {
        ...state,
        status: MATRIX_STATUS.FROZEN,
        seq: { ...state.seq, version },
        versions: [...state.versions, snapshot],
      };
    }

    // ---------- 调整：带原因新建版本，基于最新冻结版开启草稿 ----------
    case 'matrix/adjust': {
      const check = canAdjust(state, action.payload.reason);
      if (!check.ok) return state;
      const version = state.seq.version + 1;
      const base = latestFrozen(state.versions);
      return {
        ...state,
        status: MATRIX_STATUS.DRAFT,
        seq: { ...state.seq, version },
        // 编码以冻结版为调整基线；文献元数据不属于冻结范围，保留当前值
        codes: clone(base.codes),
        versions: [
          ...state.versions,
          {
            version,
            type: VERSION_TYPE.ADJUST,
            reason: action.payload.reason.trim(),
            baseVersion: base.version,
            createdAt: Date.now(),
          },
        ],
      };
    }

    // ---------- 撤回：仅回到最近冻结版 ----------
    case 'matrix/withdraw': {
      const check = canWithdraw(state);
      if (!check.ok) return state;
      return {
        ...state,
        status: MATRIX_STATUS.FROZEN,
        papers: clone(check.target.papers),
        codes: clone(check.target.codes),
      };
    }

    default:
      return state;
  }
}

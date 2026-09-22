// 判定层：操作守卫（矩阵冻结状态机）
// 矩阵冻结后编码只读；调整须带原因新建版本；撤回仅回到最近冻结版。

import { MATRIX_STATUS } from '../data/constants.js';
import { findDuplicateCodes } from './matrix.js';

// 冻结前校验：至少一条编码、无同页重复、无未说明的方向冲突
export function canFreeze(state) {
  const errors = [];
  if (!state.codes.length) errors.push('矩阵中没有任何已登记编码，无法冻结');
  const dup = findDuplicateCodes(state.codes);
  if (dup) errors.push(`存在同一文献同一页重复编码（编码 #${dup.codeId}），无法冻结`);
  const byPaper = new Map();
  state.codes.forEach((c) => {
    if (!byPaper.has(c.paperId)) byPaper.set(c.paperId, new Set());
    byPaper.get(c.paperId).add(c.direction);
  });
  for (const c of state.codes) {
    if (byPaper.get(c.paperId).size > 1 && !(c.divergence && c.divergence.trim())) {
      errors.push(`《${state.papers.find((p) => p.id === c.paperId)?.title || c.paperId}》存在方向冲突但编码 #${c.id} 缺少分歧说明`);
      break;
    }
  }
  return { ok: errors.length === 0, errors };
}

// 冻结态守卫：写编码操作
export function guardWritable(state) {
  if (state.status === MATRIX_STATUS.FROZEN) {
    return {
      ok: false,
      reason: '矩阵已冻结，编码只读。如需调整，请在「版本」中带原因新建版本。',
    };
  }
  return { ok: true };
}

export function canAdjust(state, reason) {
  if (state.status !== MATRIX_STATUS.FROZEN)
    return { ok: false, reason: '仅冻结后的矩阵可以发起调整' };
  if (!reason || !reason.trim()) return { ok: false, reason: '调整版本必须填写调整原因' };
  return { ok: true };
}

// 撤回仅回到最近冻结版：当前必须是草稿态（曾冻结过），且确实存在可撤回目标
export function canWithdraw(state) {
  if (state.status !== MATRIX_STATUS.DRAFT)
    return { ok: false, reason: '仅调整中的草稿可以撤回' };
  const target = latestFrozen(state.versions);
  if (!target) return { ok: false, reason: '没有可撤回的冻结版' };
  return { ok: true, target };
}

export function latestFrozen(versions) {
  // 仅冻结版带快照；撤回目标固定为最近的冻结版，调整事件不算。
  // 按版本号而非时间戳选择（同步操作时间戳可能相同）。
  return (
    versions
      .filter((v) => v.type === 'freeze')
      .sort((a, b) => a.version - b.version)
      .at(-1) || null
  );
}

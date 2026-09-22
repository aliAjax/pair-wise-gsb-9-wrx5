// 处理层：Store —— 单一数据源，原子持久化，向界面暴露动作与派生矩阵

import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { reducer } from './reducer.js';
import { loadState, saveState } from '../data/storage.js';
import { buildMatrix } from '../rules/matrix.js';
import { validateBatch } from '../rules/validate.js';
import { canFreeze, canAdjust, canWithdraw } from '../rules/guards.js';

const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const ref = useRef(state);
  ref.current = state;

  // 任何状态变化立即整体写回 —— 刷新后文献、编码、矩阵、版本保持一致
  useEffect(() => {
    saveState(state);
  }, [state]);

  const api = useMemo(() => {
    const s = () => ref.current;
    return {
      get state() {
        return s();
      },
      dispatch,
      // 文献
      addPaper: (payload) => dispatch({ type: 'paper/add', payload }),
      updatePaper: (id, patch) => dispatch({ type: 'paper/update', payload: { id, patch } }),
      // 编码：先校验（界面据此展示拒绝报告），通过才提交，整批事务
      reviewBatch: (rows) => validateBatch(rows, s().papers, s().codes),
      submitBatch: (rows) => dispatch({ type: 'code/submitBatch', payload: { rows } }),
      deleteCode: (id) => dispatch({ type: 'code/delete', payload: { id } }),
      // 矩阵版本
      freezeCheck: () => canFreeze(s()),
      freeze: (reason) => dispatch({ type: 'matrix/freeze', payload: { reason } }),
      adjustCheck: (reason) => canAdjust(s(), reason),
      adjust: (reason) => dispatch({ type: 'matrix/adjust', payload: { reason } }),
      withdrawCheck: () => canWithdraw(s()),
      withdraw: () => dispatch({ type: 'matrix/withdraw' }),
    };
  }, []);

  const matrix = useMemo(() => buildMatrix(state.papers, state.codes), [state.papers, state.codes]);

  return <StoreCtx.Provider value={{ state, matrix, api }}>{children}</StoreCtx.Provider>;
}

export const useStore = () => {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用');
  return ctx;
};

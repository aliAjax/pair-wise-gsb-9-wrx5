// 界面层：通用组件（不包含业务判定）

import React, { createContext, useCallback, useContext, useState } from 'react';
import { directionSymbol } from '../data/constants.js';
import { latestFrozen } from '../rules/guards.js';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const notify = useCallback((text, kind = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, kind }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={notify}>
      {children}
      <div className="toast-stack">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function StatusBadge({ status, versions }) {
  if (status === 'frozen') {
    const v = latestFrozen(versions || []);
    return (
      <span className="badge frozen">
        ❄ 已冻结{v ? ` · v${v.version}` : ''}
      </span>
    );
  }
  return <span className="badge draft">✎ 草稿（编码可写）</span>;
}

export function DirChip({ d }) {
  return (
    <span className={`dir-chip ${d}`} title={d}>
      {directionSymbol(d)}
    </span>
  );
}

export function Empty({ children }) {
  return <div className="empty-hint">{children}</div>;
}

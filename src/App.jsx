// 界面层：应用壳（导航只负责切换视图，业务判定全部在 rules / processing）

import React, { useState } from 'react';
import { StoreProvider, useStore } from './processing/store.jsx';
import { ToastProvider } from './ui/common.jsx';
import LibraryView from './ui/LibraryView.jsx';
import CodingView from './ui/CodingView.jsx';
import MatrixView from './ui/MatrixView.jsx';
import VersionsView from './ui/VersionsView.jsx';
import { MATRIX_STATUS } from './data/constants.js';
import { latestFrozen } from './rules/guards.js';

const TABS = [
  { key: 'library', icon: '▤', label: '文献库' },
  { key: 'coding', icon: '✎', label: '编码登记' },
  { key: 'matrix', icon: '▦', label: '证据矩阵' },
  { key: 'versions', icon: '❄', label: '版本管理' },
];

function Shell() {
  const { state, matrix } = useStore();
  const [tab, setTab] = useState('library');
  const frozen = state.status === MATRIX_STATUS.FROZEN;
  const frozenV = latestFrozen(state.versions);

  return (
    <div className="app">
      <aside>
        <div className="logo"><span>∴</span> EVIDENCE MATRIX</div>
        <div className="library-head">
          <span>系统综述工作台</span>
          <strong>
            {matrix.stats.coded}
            <small> / {state.papers.length} 篇可合并</small>
          </strong>
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              {t.icon} <span>{t.label}</span>
              {t.key === 'coding' && <b>{state.codes.length}</b>}
              {t.key === 'versions' && <b>{state.versions.length}</b>}
            </button>
          ))}
        </nav>
        <div className="side-tags">
          <small>矩阵状态</small>
          <button className={frozen ? 'frozen-state' : 'draft-state'} onClick={() => setTab('versions')}>
            {frozen ? `❄ 已冻结${frozenV ? ` v${frozenV.version}` : ''} · 只读` : '✎ 草稿 · 编码可写'}
          </button>
        </div>
        <div className="side-foot">
          <small>本地数据库 · 原子持久化</small>
          <small>刷新后文献 / 编码 / 矩阵 / 版本一致</small>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="crumb">SYSTEMATIC REVIEW / {tab.toUpperCase()}</span>
            <h1>{TABS.find((t) => t.key === tab)?.label}</h1>
          </div>
          <div className="actions">
            <button className="outline" onClick={() => setTab('coding')}>＋ 登记编码</button>
            <button className="primary" onClick={() => setTab('matrix')}>▦ 查看矩阵</button>
          </div>
        </header>
        {tab === 'library' && <LibraryView />}
        {tab === 'coding' && <CodingView />}
        {tab === 'matrix' && <MatrixView />}
        {tab === 'versions' && <VersionsView />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  );
}

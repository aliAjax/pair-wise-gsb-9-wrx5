// 界面层：版本管理
// 冻结后编码只读；调整须带原因新建版本；撤回仅回到最近冻结版。

import React, { useState } from 'react';
import { useStore } from '../processing/store.jsx';
import { useToast, StatusBadge, Empty } from './common.jsx';
import { MATRIX_STATUS, VERSION_TYPE } from '../data/constants.js';
import MatrixView from './MatrixView.jsx';

export default function VersionsView() {
  const { state, api } = useStore();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [viewing, setViewing] = useState(null);

  if (viewing) {
    return (
      <div className="versions">
        <button className="outline back" onClick={() => setViewing(null)}>← 返回版本列表（只读检视，未改动任何数据）</button>
        <MatrixView snapshot={viewing} />
      </div>
    );
  }

  const frozen = state.status === MATRIX_STATUS.FROZEN;
  const freezeCheck = api.freezeCheck();
  const withdrawCheck = api.withdrawCheck();
  const frozenVersions = state.versions.filter((v) => v.type === VERSION_TYPE.FREEZE);

  const doFreeze = () => {
    const check = api.freezeCheck();
    if (!check.ok) return toast(check.errors[0], 'err');
    api.freeze(reason.trim() || '冻结证据矩阵');
    setReason('');
    toast(`矩阵已冻结：v${api.state.seq.version}（编码转只读）`);
  };

  const doAdjust = () => {
    const check = api.adjustCheck(reason);
    if (!check.ok) return toast(check.reason, 'err');
    api.adjust(reason);
    setReason('');
    toast(`已基于最新冻结版创建调整版 v${api.state.seq.version}，编码恢复可写`);
  };

  const doWithdraw = () => {
    const check = api.withdrawCheck();
    if (!check.ok) return toast(check.reason, 'err');
    const v = check.target.version;
    if (!window.confirm(`确认撤回？编码将仅回到最近冻结版 v${v}，调整草稿中的改动全部丢弃。`)) return;
    api.withdraw();
    toast(`已撤回到冻结版 v${v}`);
  };

  return (
    <div className="versions">
      <div className="coding-head">
        <div>
          <span className="crumb">VERSION CONTROL</span>
          <h2>矩阵冻结与版本</h2>
        </div>
        <StatusBadge status={state.status} versions={state.versions} />
      </div>

      <section className="version-panel">
        {state.status === MATRIX_STATUS.DRAFT && state.versions.length === 0 && (
          <>
            <h3>首次冻结</h3>
            <p className="muted">
              冻结后编码转为只读；冻结前会校验：至少 1 条编码、无同页重复、方向冲突均有分歧说明。
            </p>
            {!freezeCheck.ok && (
              <ul className="guard-errors">
                {freezeCheck.errors.map((e, i) => <li key={i}>✕ {e}</li>)}
              </ul>
            )}
            <label className="reason-input">
              冻结备注（可选）
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：完成首轮双人编码" />
            </label>
            <button className="primary" onClick={doFreeze} disabled={!freezeCheck.ok}>
              ❄ 冻结矩阵
            </button>
          </>
        )}

        {frozen && (
          <>
            <h3>冻结版操作</h3>
            <p className="muted">当前编码只读。需要修改时，必须填写调整原因并新建版本；不允许原地改写冻结数据。</p>
            <label className="reason-input">
              调整原因（必填）
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="如：补录遗漏的页码 p.21；修正 #3 的样本量"
              />
            </label>
            <div className="btn-row">
              <button className="primary" onClick={doAdjust} disabled={!reason.trim()}>
                ✎ 带原因新建调整版本
              </button>
              <button className="outline" disabled title="冻结态无需撤回">
                ↩ 撤回（仅调整中可用）
              </button>
            </div>
          </>
        )}

        {state.status === MATRIX_STATUS.DRAFT && state.versions.length > 0 && (
          <>
            <h3>调整中（草稿基于 v{state.versions.filter((v) => v.type === VERSION_TYPE.ADJUST).slice(-1)[0]?.baseVersion}）</h3>
            <p className="muted">
              正在调整：编码可增删。撤回只会回到<strong>最近一次冻结版</strong>，不能跨版本回退；确认无误后可再次冻结。
            </p>
            {!freezeCheck.ok && (
              <ul className="guard-errors">
                {freezeCheck.errors.map((e, i) => <li key={i}>✕ {e}</li>)}
              </ul>
            )}
            <div className="btn-row">
              <button className="primary" onClick={doFreeze} disabled={!freezeCheck.ok}>
                ❄ 再次冻结（生成新版本）
              </button>
              <button className="outline danger-btn" onClick={doWithdraw} disabled={!withdrawCheck.ok}>
                ↩ 撤回到最近冻结版 v{withdrawCheck.target?.version}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="version-timeline">
        <h3>版本时间线（{state.versions.length}）</h3>
        {[...state.versions].reverse().map((v) => (
          <div className={'v-item ' + v.type} key={v.version}>
            <div className="v-mark">{v.type === VERSION_TYPE.FREEZE ? '❄' : '✎'}</div>
            <div className="v-body">
              <div className="v-title">
                v{v.version}
                <span className="v-type">{v.type === VERSION_TYPE.FREEZE ? '冻结版' : '调整版本'}</span>
                {v.baseVersion && <span className="v-base">基于 v{v.baseVersion}</span>}
              </div>
              <div className="v-reason">{v.reason}</div>
              <div className="v-meta">
                {new Date(v.createdAt).toLocaleString('zh-CN')}
                {v.codes && <> · {v.codes.length} 条编码 · {v.papers?.length} 篇文献快照</>}
              </div>
            </div>
            {v.codes && (
              <button className="outline" onClick={() => setViewing(v)}>只读检视矩阵</button>
            )}
          </div>
        ))}
        {!state.versions.length && <Empty>尚无版本。冻结后，每份快照都会独立保存文献与编码，可随时只读检视。</Empty>}
        {frozenVersions.length > 0 && (
          <p className="muted small">撤回规则：撤回目标固定为最近冻结版（v{Math.max(...frozenVersions.map((v) => v.version))}），不支持跨版本回退。</p>
        )}
      </section>
    </div>
  );
}

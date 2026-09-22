// 界面层：证据编码登记台
// 批次事务：缺任一字段 / 方向冲突无分歧说明 / 同页重复 -> 整批拒绝并列出篇名、页码与原值

import React, { useMemo, useState } from 'react';
import { useStore } from '../processing/store.jsx';
import { useToast, Empty } from './common.jsx';
import { RESEARCH_DESIGNS, EFFECT_DIRECTIONS, MATRIX_STATUS } from '../data/constants.js';
import { parsePages, canonicalPages } from '../rules/pages.js';
import { latestFrozen } from '../rules/guards.js';

const blankRow = () => ({
  uid: Date.now() + Math.random(),
  paperId: '',
  design: '',
  sampleSize: '',
  direction: '',
  pages: '',
  divergence: '',
  effectText: '',
});

export default function CodingView() {
  const { state, api } = useStore();
  const toast = useToast();
  const [rows, setRows] = useState([blankRow()]);
  const [rejection, setRejection] = useState(null);
  const frozen = state.status === MATRIX_STATUS.FROZEN;
  const frozenV = latestFrozen(state.versions);

  const set = (uid, field, value) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, [field]: value } : r)));

  // 实时提示：当前批次内的同页重复与方向冲突（不阻断输入）
  const hints = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      if (!r.paperId) return;
      const { keys } = parsePages(r.pages);
      keys.forEach((pg) => map.set(`${r.paperId}:${pg}`, (map.get(`${r.paperId}:${pg}`) || 0) + 1));
    });
    const out = [];
    rows.forEach((r) => {
      if (!r.paperId) return;
      const { keys } = parsePages(r.pages);
      if (keys.some((pg) => map.get(`${r.paperId}:${pg}`) > 1))
        out.push({ uid: r.uid, level: 'danger', text: '本批存在同一文献同一页重复，提交将被整批拒绝' });
      const dirs = new Set(
        state.codes.filter((c) => c.paperId === Number(r.paperId)).map((c) => c.direction)
      );
      rows
        .filter((o) => o.paperId === r.paperId)
        .forEach((o) => o.direction && dirs.add(o.direction));
      if (dirs.size > 1 && !r.divergence.trim())
        out.push({ uid: r.uid, level: 'warn', text: '该文献效应方向冲突，须填写分歧说明' });
    });
    return out;
  }, [rows, state.codes]);

  const submit = () => {
    if (frozen) {
      setRejection(null);
      return toast('矩阵已冻结，编码只读。请到「版本」带原因新建版本后再调整。', 'err');
    }
    const payload = rows.map((r) => ({ ...r, paperId: r.paperId ? Number(r.paperId) : '' }));
    const result = api.reviewBatch(payload);
    if (!result.ok) {
      setRejection(result.errors); // 整批拒绝：无任何编码写入
      toast(`整批拒绝：${result.errors.length} 处问题`, 'err');
      return;
    }
    api.submitBatch(payload);
    setRows([blankRow()]);
    setRejection(null);
    toast(`批次已登记：${result.parsed.length} 条编码进入矩阵`);
  };

  return (
    <div className="coding">
      <div className="coding-head">
        <div>
          <span className="crumb">CODING DESK</span>
          <h2>批次证据编码</h2>
        </div>
        <div className="coding-actions">
          <button className="outline" onClick={() => setRows([...rows, blankRow()])} disabled={frozen}>
            ＋ 再加一行
          </button>
          <button className="primary" onClick={submit} disabled={frozen}>
            提交整批校验
          </button>
        </div>
      </div>

      {frozen && (
        <div className="rule-banner danger">
          ❄ 矩阵当前为冻结版{frozenV ? `（v${frozenV.version}）` : ''}，编码只读。调整须在「版本」页带原因新建版本。
        </div>
      )}

      <div className="rule-banner">
        纳入规则：每条编码必须登记 <b>研究设计、样本量、效应方向、证据页码</b>，缺任一项整批拒绝；
        效应方向冲突须写分歧说明；同一文献同一页不得重复编码。
      </div>

      {rejection && (
        <div className="reject-panel">
          <h3>整批拒绝报告（{rejection.length} 处问题，未写入任何编码）</h3>
          <table>
            <thead>
              <tr>
                <th style={{ width: 50 }}>行</th>
                <th style={{ width: 220 }}>篇名</th>
                <th style={{ width: 90 }}>页码</th>
                <th>原值</th>
                <th>问题</th>
              </tr>
            </thead>
            <tbody>
              {rejection.map((e, i) => (
                <tr key={i}>
                  <td>{e.rowNo}</td>
                  <td className="t-title">{e.title}</td>
                  <td>{e.page || '—'}</td>
                  <td><code>{e.original === '' || e.original == null ? '（空）' : String(e.original)}</code></td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="batch-rows">
        {rows.map((r, idx) => {
          const rowHints = hints.filter((h) => h.uid === r.uid);
          const { keys, invalidTokens } = parsePages(r.pages);
          return (
            <div className="batch-row" key={r.uid}>
              <div className="batch-row-top">
                <span className="row-no">#{idx + 1}</span>
                <select value={r.paperId} onChange={(e) => set(r.uid, 'paperId', e.target.value)} disabled={frozen}>
                  <option value="">选择文献…</option>
                  {state.papers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.year} · {p.title}
                    </option>
                  ))}
                </select>
                {rows.length > 1 && !frozen && (
                  <button className="link-danger" onClick={() => setRows(rows.filter((x) => x.uid !== r.uid))}>
                    移除
                  </button>
                )}
              </div>
              <div className="batch-grid">
                <label>
                  研究设计 *
                  <select value={r.design} onChange={(e) => set(r.uid, 'design', e.target.value)} disabled={frozen}>
                    <option value="">—</option>
                    {RESEARCH_DESIGNS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  样本量 n *
                  <input
                    type="number"
                    min="10"
                    placeholder="≥10 的整数"
                    value={r.sampleSize}
                    onChange={(e) => set(r.uid, 'sampleSize', e.target.value)}
                    disabled={frozen}
                  />
                </label>
                <label>
                  效应方向 *
                  <select value={r.direction} onChange={(e) => set(r.uid, 'direction', e.target.value)} disabled={frozen}>
                    <option value="">—</option>
                    {EFFECT_DIRECTIONS.map((d) => (
                      <option key={d.value} value={d.value}>{d.symbol} {d.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  证据页码 *
                  <input
                    placeholder="如 12 或 12-15, 18"
                    value={r.pages}
                    onChange={(e) => set(r.uid, 'pages', e.target.value)}
                    disabled={frozen}
                  />
                  {r.pages && (
                    <small className={invalidTokens.length ? 'page-err' : 'page-ok'}>
                      {invalidTokens.length
                        ? `无法识别：${invalidTokens.join('、')}`
                        : keys.length
                        ? `解析为 p.${canonicalPages(keys)}`
                        : ''}
                    </small>
                  )}
                </label>
              </div>
              <label className="wide">
                分歧说明（方向冲突时必填）
                <input
                  placeholder="如：同一研究不同结局指标方向相反，主效应为…，调节效应为…"
                  value={r.divergence}
                  onChange={(e) => set(r.uid, 'divergence', e.target.value)}
                  disabled={frozen}
                />
              </label>
              <label className="wide">
                效应摘录（可选，原文证据）
                <input
                  value={r.effectText}
                  onChange={(e) => set(r.uid, 'effectText', e.target.value)}
                  disabled={frozen}
                />
              </label>
              {rowHints.map((h, i) => (
                <div key={i} className={`row-hint ${h.level}`}>{h.text}</div>
              ))}
            </div>
          );
        })}
      </div>

      {state.codes.length === 0 ? (
        <Empty>尚无编码。填写上方批次表单并通过整批校验后，编码才会进入证据矩阵。</Empty>
      ) : (
        <RegisteredList />
      )}
    </div>
  );
}

function RegisteredList() {
  const { state, api } = useStore();
  const frozen = state.status === MATRIX_STATUS.FROZEN;
  const title = (id) => state.papers.find((p) => p.id === id)?.title || `#${id}`;
  return (
    <div className="registered">
      <h4>本版已登记编码（{state.codes.length}）</h4>
      <table>
        <thead>
          <tr>
            <th>#</th><th>文献</th><th>设计</th><th>n</th><th>方向</th><th>页码</th><th>分歧说明</th>
            {!frozen && <th />}
          </tr>
        </thead>
        <tbody>
          {[...state.codes]
            .sort((a, b) => b.id - a.id)
            .map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td className="t-title">{title(c.paperId)}</td>
                <td>{RESEARCH_DESIGNS.find((d) => d.value === c.design)?.label}</td>
                <td>{c.sampleSize}</td>
                <td><span className={`dir-chip ${c.direction}`}>{EFFECT_DIRECTIONS.find((d) => d.value === c.direction)?.symbol}</span></td>
                <td>p.{canonicalPages(c.pages)}</td>
                <td>{c.divergence || '—'}</td>
                {!frozen && (
                  <td>
                    <button className="link-danger" onClick={() => api.deleteCode(c.id)}>删除</button>
                  </td>
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

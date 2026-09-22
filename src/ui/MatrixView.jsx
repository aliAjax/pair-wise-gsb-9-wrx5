// 界面层：证据矩阵视图（以文献为行；仅完整编码的文献可进入合并）

import React, { useMemo } from 'react';
import { useStore } from '../processing/store.jsx';
import { Empty, DirChip, StatusBadge } from './common.jsx';
import { buildMatrix } from '../rules/matrix.js';
import { designLabel } from '../data/constants.js';

export default function MatrixView({ snapshot }) {
  const live = useStore();
  // snapshot 存在时为只读检视历史冻结版
  const { papers, codes } = snapshot
    ? { papers: snapshot.papers, codes: snapshot.codes }
    : { papers: live.state.papers, codes: live.state.codes };
  const status = snapshot ? 'frozen' : live.state.status;
  const version = snapshot ? snapshot.version : live.state.seq.version;
  const { rows, stats } = useMemo(() => buildMatrix(papers, codes), [papers, codes]);

  return (
    <div className="matrix-view">
      <div className="coding-head">
        <div>
          <span className="crumb">{snapshot ? `ARCHIVE · 只读检视 v${snapshot.version}` : 'EVIDENCE MATRIX'}</span>
          <h2>系统综述证据矩阵</h2>
        </div>
        <StatusBadge status={status} versions={snapshot ? [snapshot] : live.state.versions} />
      </div>

      <div className="stat-cards">
        <div className="stat"><strong>{stats.papers}</strong><small>文献总数</small></div>
        <div className="stat ok"><strong>{stats.coded}</strong><small>可纳入合并</small></div>
        <div className="stat warn"><strong>{stats.uncoded}</strong><small>编码不全 · 排除</small></div>
        <div className="stat"><strong>{stats.codes}</strong><small>证据条目</small></div>
        <div className="stat"><strong>{stats.samplePool}</strong><small>样本池合计 n</small></div>
        <div className={'stat ' + (stats.conflicts ? 'danger' : '')}>
          <strong>{stats.conflicts}</strong><small>方向冲突文献</small>
        </div>
      </div>

      <div className="dir-legend">
        方向分布：
        <span><DirChip d="positive" /> 正向 {stats.directionCounts.positive}</span>
        <span><DirChip d="negative" /> 负向 {stats.directionCounts.negative}</span>
        <span><DirChip d="null" /> 零结果 {stats.directionCounts.null}</span>
        <span><DirChip d="mixed" /> 混合 {stats.directionCounts.mixed}</span>
      </div>

      <div className="matrix-table-wrap">
        <table className="matrix-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>文献</th>
              <th style={{ width: 150 }}>研究设计</th>
              <th style={{ width: 80 }}>样本量</th>
              <th style={{ width: 120 }}>效应方向</th>
              <th style={{ width: 120 }}>证据页码</th>
              <th style={{ width: 240 }}>分歧说明</th>
              <th style={{ width: 90 }}>纳入</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.paperId} className={r.eligible ? '' : 'excluded'}>
                <td>{r.paperId}</td>
                <td className="t-title">
                  <strong>{r.title}</strong>
                  <small>{r.authors} · {r.year}</small>
                  {r.codeCount > 0 && <small className="sub">含 {r.codeCount} 条编码</small>}
                </td>
                <td>{r.eligible ? r.designs.map(designLabel).join('；') : '—'}</td>
                <td>{r.eligible ? r.sampleSizeTotal : '—'}</td>
                <td>
                  {r.eligible ? (
                    <span className={'dirs ' + (r.conflict ? 'conflict' : '')}>
                      {r.directions.map((d, i) => <DirChip key={i} d={d} />)}
                      {r.conflict && <em className="conflict-tag">冲突</em>}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{r.eligible ? `p.${r.pagesText}` : '—'}</td>
                <td>
                  {r.conflict ? (
                    r.unexplainedConflict ? (
                      <span className="danger-text">缺少分歧说明</span>
                    ) : (
                      <ul className="div-list">
                        {r.divergences.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    )
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {r.eligible ? (
                    <span className="pill ok">纳入合并</span>
                  ) : (
                    <span className="pill no">不可纳入</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!stats.codes && <Empty>矩阵为空：到「编码登记」提交完整批次后，文献方可纳入合并。</Empty>}
      {!snapshot && (
        <p className="matrix-foot">
          判定规则：四项登记（设计 / 样本量 / 方向 / 页码）齐全才可纳入；同文献同页重复编码、冲突无分歧说明的批次会被整批拒绝；冻结后本表只读。
        </p>
      )}
    </div>
  );
}

// 界面层：文献库视图

import React, { useMemo, useState } from 'react';
import { useStore } from '../processing/store.jsx';
import { useToast, Empty } from './common.jsx';
import { designLabel, directionLabel, directionSymbol } from '../data/constants.js';
import { canonicalPages } from '../rules/pages.js';

export default function LibraryView() {
  const { state, matrix, api } = useStore();
  const toast = useToast();
  const [selected, setSelected] = useState(state.papers[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: '', authors: '', year: '2024', venue: '', abstract: '', tags: '' });

  const filtered = useMemo(
    () =>
      state.papers.filter((p) =>
        `${p.title}${p.authors}${p.abstract}`.toLowerCase().includes(query.toLowerCase())
      ),
    [state.papers, query]
  );
  const cur = state.papers.find((p) => p.id === selected) || filtered[0];
  const row = matrix.rows.find((r) => r.paperId === cur?.id);

  const add = () => {
    if (!form.title.trim()) return toast('标题不能为空', 'err');
    api.addPaper({
      ...form,
      tags: form.tags.split(',').map((x) => x.trim()).filter(Boolean),
    });
    toast('文献已加入文献库');
    setForm({ title: '', authors: '', year: '2024', venue: '', abstract: '', tags: '' });
    setShow(false);
  };

  return (
    <div className="body two-col">
      <section className="paper-list">
        <div className="search">
          ⌕
          <input
            placeholder="搜索标题、作者或摘要…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery('')}>×</button>
          )}
        </div>
        {filtered.map((p) => {
          const r = matrix.rows.find((x) => x.paperId === p.id);
          return (
            <button
              className={'paper ' + (cur?.id === p.id ? 'selected' : '')}
              onClick={() => setSelected(p.id)}
              key={p.id}
            >
              <div className="paper-year">{p.year}</div>
              <div className="paper-copy">
                <h3>{p.title}</h3>
                <p>{p.authors}</p>
                <div>
                  {r?.eligible ? (
                    <span className="mini ok">已登记 {r.codeCount} 条编码</span>
                  ) : (
                    <span className="mini warn">未编码 · 不能进入合并</span>
                  )}
                  {r?.conflict && <span className="mini danger">方向冲突</span>}
                </div>
              </div>
              <small className={'status ' + p.status}>{p.status}</small>
            </button>
          );
        })}
        {!filtered.length && <Empty>没有找到匹配的文献</Empty>}
      </section>

      <section className="detail">
        {cur ? (
          <>
            <h2>{cur.title}</h2>
            <p className="authors">{cur.authors}</p>
            <div className="detail-section">
              <h4>
                摘要 <span>ABSTRACT</span>
              </h4>
              <p>{cur.abstract || '（暂无摘要）'}</p>
            </div>
            <div className="detail-section">
              <h4>
                出版信息 <span>PUBLICATION</span>
              </h4>
              <div className="pub-grid">
                <div>
                  <small>出版物</small>
                  <strong>{cur.venue || '—'}</strong>
                </div>
                <div>
                  <small>年份</small>
                  <strong>{cur.year || '—'}</strong>
                </div>
              </div>
            </div>
            <div className="detail-section">
              <h4>
                已登记编码 <span>CODED EVIDENCE · {row?.codeCount || 0}</span>
              </h4>
              {row?.eligible ? (
                <div className="code-cards">
                  {row.codes.map((c) => (
                    <div className="code-card" key={c.id}>
                      <div className="code-card-head">
                        <span className={`dir-chip ${c.direction}`}>{directionSymbol(c.direction)}</span>
                        <strong>#{c.id}</strong>
                        <span className="pages">p. {canonicalPages(c.pages)}</span>
                        <span className="n">n={c.sampleSize}</span>
                        {state.status === 'draft' && (
                          <button className="link-danger" onClick={() => api.deleteCode(c.id)}>
                            删除
                          </button>
                        )}
                      </div>
                      <div className="code-meta">
                        {designLabel(c.design)} · {directionLabel(c.direction)}
                      </div>
                      {c.effectText && <p className="effect-text">“{c.effectText}”</p>}
                      {c.divergence && (
                        <p className="divergence">⚠ 分歧说明：{c.divergence}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>该文献尚无完整编码（研究设计、样本量、效应方向、证据页码齐全后才可进入合并）。</Empty>
              )}
            </div>
          </>
        ) : (
          <Empty>文献库为空，请先添加文献。</Empty>
        )}
      </section>

      {show && (
        <div className="modal-bg" onClick={() => setShow(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setShow(false)}>×</button>
            <span className="crumb">NEW REFERENCE</span>
            <h2>添加一篇文献</h2>
            <label>
              标题
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>
              作者
              <input value={form.authors} onChange={(e) => setForm({ ...form, authors: e.target.value })} />
            </label>
            <div className="two">
              <label>
                年份
                <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
              </label>
              <label>
                出版物
                <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
              </label>
            </div>
            <label>
              关键词（逗号分隔）
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </label>
            <label>
              摘要
              <textarea rows="3" value={form.abstract} onChange={(e) => setForm({ ...form, abstract: e.target.value })} />
            </label>
            <button className="primary full" onClick={add}>
              保存文献
            </button>
          </div>
        </div>
      )}

      <button className="fab" onClick={() => setShow(true)} title="添加文献">＋</button>
    </div>
  );
}

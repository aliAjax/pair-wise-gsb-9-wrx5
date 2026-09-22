import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { store, mergeRecords } from './storage/store.js';
import {
  evaluateBatch,
  buildMatrix,
  validateCoding,
  findEffectConflicts,
} from './domain/rules.js';
import { parseBatch } from './domain/parse.js';
import { DESIGNS, EFFECTS } from './domain/constants.js';

const useStore = () =>
  useSyncExternalStore((fn) => store.subscribe(fn), () => store.getState());

const FIELD_LABEL = {
  studyDesign: '研究设计',
  sampleSize: '样本量',
  effectDirection: '效应方向',
  evidencePage: '证据页码',
  disagreement: '分歧说明',
};

const EFFECT_BADGE = { 阳性: 'pos', 阴性: 'neg', 无效应: 'null', 混合: 'mix' };

let toastTimer;
function useToast() {
  const [toast, setToast] = useState(null);
  const show = (text, kind = 'ok') => {
    clearTimeout(toastTimer);
    setToast({ text, kind });
    toastTimer = setTimeout(() => setToast(null), 3600);
  };
  return [toast, show];
}

/** 统一捕获存储层抛出的只读/缺原因异常；返回是否成功 */
function guard(fn, showToast) {
  try {
    fn();
    return true;
  } catch (e) {
    showToast(e.message, 'err');
    return false;
  }
}

// ---------- 通用小组件 ----------
function FrozenBanner({ onAdjust }) {
  const latest = store.latestVersion();
  return (
    <div className="frozen-banner">
      <span>
        🔒 矩阵已冻结（v{latest}）· 文献与编码只读。调整须登记原因并新建版本。
      </span>
      <button className="primary" onClick={onAdjust}>
        ＋ 带原因新建版本
      </button>
    </div>
  );
}

function Modal({ title, crumb, onClose, children, wide }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div
        className={'modal' + (wide ? ' wide' : '')}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close" onClick={onClose}>
          ×
        </button>
        <span className="crumb">{crumb}</span>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function IssueTable({ issues }) {
  return (
    <div className="issue-wrap">
      <table className="issue-table">
        <thead>
          <tr>
            <th>类型</th>
            <th>篇名</th>
            <th>页码</th>
            <th>字段</th>
            <th>原值</th>
            <th>问题</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((it, i) => (
            <tr key={i}>
              <td>
                <span className={'issue-kind k-' + it.kind}>{it.kind}</span>
              </td>
              <td className="t-title">{it.title}</td>
              <td className="mono">{it.page}</td>
              <td>{FIELD_LABEL[it.field] || it.field}</td>
              <td className="mono orig">{String(it.original)}</td>
              <td className="reason">{it.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- 视图一：文献库 ----------
function LibraryView({ papers, frozen, showToast, onAdjust }) {
  const [selected, setSelected] = useState(papers[0]?.id);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('全部');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    title: '',
    authors: '',
    year: '2024',
    venue: '',
    abstract: '',
    tags: '',
  });

  const tags = ['全部', ...new Set(papers.flatMap((x) => x.tags))];
  const filtered = papers.filter(
    (x) =>
      (tag === '全部' || x.tags.includes(tag)) &&
      `${x.title}${x.authors}${x.abstract}`.toLowerCase().includes(query.toLowerCase()),
  );
  const cur = papers.find((x) => x.id === selected) || filtered[0];

  const update = (k, v) =>
    guard(() => store.updatePaperMeta(cur.id, { [k]: v }), showToast);

  const add = () => {
    if (!form.title.trim()) return showToast('请填写标题', 'err');
    const ok = guard(
      () =>
        store.addPaper({
          ...form,
          year: +form.year,
          tags: form.tags
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      showToast,
    );
    if (!ok) return;
    setForm({ title: '', authors: '', year: '2024', venue: '', abstract: '', tags: '' });
    setShowAdd(false);
    showToast('文献已加入研究库');
  };

  return (
    <>
      <header>
        <div>
          <span className="crumb">REVIEW / LIBRARY</span>
          <h1>文献库</h1>
        </div>
        <div className="actions">
          <button
            className="outline"
            onClick={() => {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(
                new Blob([papers.map((x) => x.cite).join('\n')], { type: 'text/plain' }),
              );
              a.download = 'references.txt';
              a.click();
              showToast('引用列表已导出');
            }}
          >
            ↓ 导出引用
          </button>
          <button className="primary" onClick={() => (frozen ? onAdjust() : setShowAdd(true))}>
            ＋ 添加文献
          </button>
        </div>
      </header>
      {frozen && <FrozenBanner onAdjust={onAdjust} />}
      <div className="toolbar">
        <div className="search">
          ⌕
          <input
            placeholder="搜索标题、作者或摘要…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && <button onClick={() => setQuery('')}>×</button>}
        </div>
        <div className="tag-filter">
          {tags.map((t) => (
            <button className={tag === t ? 'on' : ''} onClick={() => setTag(t)} key={t}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="body">
        <section className="paper-list">
          {filtered.map((p) => (
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
                  {p.tags.map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                  <span className="coding-count">编码 {p.codings.length} 条</span>
                </div>
              </div>
              <small className={'status ' + p.status}>{p.status}</small>
            </button>
          ))}
          {!filtered.length && <div className="no-result">没有找到匹配的文献</div>}
        </section>
        <section className="detail">
          {cur && (
            <>
              <div className="detail-top">
                <span className="status reading">{cur.status}</span>
                <small className="mono dim">{cur.codings.length} 条编码</small>
              </div>
              <h2>{cur.title}</h2>
              <p className="authors">{cur.authors}</p>
              <div className="cite-actions">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(cur.cite);
                    showToast('引用文本已复制');
                  }}
                >
                  ▣ 复制引用
                </button>
                <button
                  onClick={() =>
                    update('status', cur.status === '已读' ? '待读' : '已读')
                  }
                >
                  {cur.status === '已读' ? '标记为待读' : '标记为已读'}
                </button>
              </div>
              <div className="detail-section">
                <h4>
                  摘要 <span>ABSTRACT</span>
                </h4>
                <p>{cur.abstract || '（无摘要）'}</p>
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
                  我的笔记 <span>PRIVATE</span>
                </h4>
                <textarea
                  className="notes"
                  placeholder={frozen ? '已冻结，只读' : '记录你的阅读想法…'}
                  readOnly={frozen}
                  value={cur.notes || ''}
                  onChange={(e) => update('notes', e.target.value)}
                />
              </div>
            </>
          )}
        </section>
      </div>
      {showAdd && (
        <Modal title="添加一篇文献" crumb="NEW REFERENCE" onClose={() => setShowAdd(false)}>
          <label>
            标题
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            作者
            <input
              value={form.authors}
              onChange={(e) => setForm({ ...form, authors: e.target.value })}
            />
          </label>
          <div className="two">
            <label>
              年份
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
              />
            </label>
            <label>
              出版物
              <input
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
              />
            </label>
          </div>
          <label>
            关键词
            <input
              value={form.tags}
              placeholder="用逗号分隔"
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
          </label>
          <label>
            摘要
            <textarea
              rows="3"
              value={form.abstract}
              onChange={(e) => setForm({ ...form, abstract: e.target.value })}
            />
          </label>
          <button className="primary full" onClick={add}>
            保存文献
          </button>
        </Modal>
      )}
    </>
  );
}

// ---------- 视图二：编码台 ----------
const emptyCoding = { studyDesign: '', sampleSize: '', effectDirection: '', evidencePage: '', finding: '' };

function CodingForm({ value, onChange, disabled }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="coding-form">
      <label>
        研究设计 *
        <select
          value={value.studyDesign}
          disabled={disabled}
          onChange={(e) => set('studyDesign', e.target.value)}
        >
          <option value="">— 选择 —</option>
          {DESIGNS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <label>
        样本量 *
        <input
          type="number"
          min="1"
          placeholder="N"
          value={value.sampleSize}
          disabled={disabled}
          onChange={(e) => set('sampleSize', e.target.value)}
        />
      </label>
      <label>
        效应方向 *
        <select
          value={value.effectDirection}
          disabled={disabled}
          onChange={(e) => set('effectDirection', e.target.value)}
        >
          <option value="">— 选择 —</option>
          {EFFECTS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <label>
        证据页码 *
        <input
          placeholder="如 12 或 12-14"
          value={value.evidencePage}
          disabled={disabled}
          onChange={(e) => set('evidencePage', e.target.value)}
        />
      </label>
      <label className="span2">
        结论摘录
        <input
          placeholder="原文关键结论（可选）"
          value={value.finding}
          disabled={disabled}
          onChange={(e) => set('finding', e.target.value)}
        />
      </label>
    </div>
  );
}

function CodingView({ papers, frozen, draft, showToast, onAdjust }) {
  const [paperId, setPaperId] = useState(papers[0]?.id);
  const [form, setForm] = useState(emptyCoding);
  const [editing, setEditing] = useState(null); // {codingId, value}
  const [reason, setReason] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null);

  const paper = papers.find((p) => p.id === paperId) || papers[0];
  const conflicts = findEffectConflicts(papers);
  const paperConflict = conflicts.find((c) => c.paperId === paper?.id);
  const isAdjustment = draft && draft.baseVersion > 0;
  const needReason = isAdjustment; // 冻结后调整：每次编码变更随操作登记原因

  const opReason = () => (needReason ? reason : '初始编码');

  const submitCoding = () => {
    const check = validateCoding(form);
    if (!check.ok) {
      return showToast(
        '编码缺项：' + check.errors.map((e) => FIELD_LABEL[e.field]).join('、'),
        'err',
      );
    }
    const dup = paper.codings.some(
      (c) => String(c.evidencePage).replace(/\s+/g, '') === String(form.evidencePage).replace(/\s+/g, ''),
    );
    if (dup) return showToast(`第 ${form.evidencePage} 页已存在编码，同一页不得重复编码`, 'err');
    if (needReason && !reason.trim()) return showToast('冻结后的调整须先填写本次操作原因', 'err');
    const ok = guard(
      () =>
        store.addCoding(paper.id, {
          ...form,
          sampleSize: Number(form.sampleSize),
          evidencePage: form.evidencePage.replace(/\s+/g, ''),
        }, opReason()),
      showToast,
    );
    if (!ok) return;
    setForm(emptyCoding);
    setReason('');
    showToast('编码已登记');
  };

  const saveEdit = () => {
    const check = validateCoding(editing.value);
    if (!check.ok)
      return showToast('编码缺项：' + check.errors.map((e) => FIELD_LABEL[e.field]).join('、'), 'err');
    if (needReason && !reason.trim()) return showToast('冻结后的调整须先填写本次操作原因', 'err');
    const ok = guard(
      () =>
        store.updateCoding(
          paper.id,
          editing.codingId,
          { ...editing.value, sampleSize: Number(editing.value.sampleSize) },
          opReason(),
        ),
      showToast,
    );
    if (!ok) return;
    setEditing(null);
    setReason('');
    showToast('编码已更新');
  };

  const removeCoding = (c) => {
    if (needReason && !reason.trim()) return showToast('冻结后的调整须先填写本次操作原因', 'err');
    if (!window.confirm(`删除第 ${c.evidencePage} 页的编码？`)) return;
    if (!guard(() => store.removeCoding(paper.id, c.id, opReason()), showToast)) return;
    setReason('');
    showToast('编码已删除');
  };

  const runImport = (commit) => {
    const { records, parseErrors } = parseBatch(importText);
    if (parseErrors.length) {
      return setImportResult({ ok: false, parseErrors, issues: [] });
    }
    // 整批预检：合并假设数据后统一判定，任一不合格 → 整批拒绝
    const merged = mergeRecords(papers, records);
    const verdict = evaluateBatch(merged);
    if (!verdict.eligible) {
      return setImportResult({ ok: false, parseErrors: [], issues: verdict.issues, count: records.length });
    }
    if (!commit) {
      return setImportResult({ ok: true, count: records.length, preview: true });
    }
    if (needReason && !reason.trim()) return showToast('冻结后的调整须先填写本次操作原因', 'err');
    let r;
    const ok = guard(() => { r = store.importRecords(records, opReason()); }, showToast);
    if (ok && r) {
      setImportResult(null);
      setImportText('');
      setShowImport(false);
      setReason('');
      showToast(`导入完成：新增 ${r.added} 篇，合并 ${r.merged} 条编码`);
    }
  };

  return (
    <>
      <header>
        <div>
          <span className="crumb">REVIEW / CODING</span>
          <h1>编码台</h1>
        </div>
        <div className="actions">
          <button className="outline" onClick={() => (frozen ? onAdjust() : setShowImport(true))}>
            ⇪ 批量导入
          </button>
        </div>
      </header>
      {frozen && <FrozenBanner onAdjust={onAdjust} />}
      {isAdjustment && (
        <div className="reason-bar">
          <span>调整版本 v{draft.version}（基于 v{draft.baseVersion}）：{draft.reason}</span>
          <input
            placeholder="本次操作原因（每次编码变更必填）"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}
      <div className="body coding-body">
        <section className="paper-list">
          {papers.map((p) => {
            const bad = p.codings.filter((c) => !validateCoding(c).ok).length;
            const conflict = conflicts.some((c) => c.paperId === p.id);
            return (
              <button
                key={p.id}
                className={'paper mini ' + (paper?.id === p.id ? 'selected' : '')}
                onClick={() => setPaperId(p.id)}
              >
                <div className="paper-copy">
                  <h3>{p.title}</h3>
                  <p>
                    {p.authors} · {p.year}
                  </p>
                  <div>
                    <span className="coding-count">{p.codings.length} 条编码</span>
                    {bad > 0 && <span className="pill bad">缺项 {bad}</span>}
                    {conflict && <span className="pill warn">方向冲突</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </section>
        <section className="detail coding-detail">
          {paper && (
            <>
              <h2>{paper.title}</h2>
              <p className="authors">
                {paper.authors} · {paper.venue} · {paper.year}
              </p>

              {paperConflict && (
                <div className="conflict-box">
                  <strong>⚠ 效应方向冲突：</strong>
                    本文献第 {paperConflict.pages.join('、')} 页并存「
                    {paperConflict.directions.join('、')}」。
                  <label>
                    分歧说明（必填，否则整批不能冻结）
                    <textarea
                      rows="2"
                      readOnly={frozen}
                      placeholder="说明方向不一致的可能原因：人群、剂量、测量时点、分析方法…"
                      value={paper.disagreement || ''}
                      onChange={(e) =>
                        guard(
                          () => store.setDisagreement(paper.id, e.target.value, opReason() || '填写分歧说明'),
                          showToast,
                        )
                      }
                    />
                  </label>
                </div>
              )}

              <div className="detail-section">
                <h4>
                  新增编码 <span>四项缺一不可进入合并</span>
                </h4>
                <CodingForm value={form} onChange={setForm} disabled={frozen} />
                {!frozen && (
                  <button className="primary" onClick={submitCoding}>
                    ＋ 登记编码
                  </button>
                )}
              </div>

              <div className="detail-section">
                <h4>
                  已登记编码 <span>{paper.codings.length} 条</span>
                </h4>
                {!paper.codings.length && <p className="dim">尚无编码。</p>}
                {paper.codings.map((c) => {
                  const v = validateCoding(c);
                  return (
                    <div className={'coding-row' + (v.ok ? '' : ' invalid')} key={c.id}>
                      {editing?.codingId === c.id ? (
                        <div className="coding-edit">
                          <CodingForm
                            value={editing.value}
                            onChange={(val) => setEditing({ codingId: c.id, value: val })}
                            disabled={false}
                          />
                          <div className="row-actions">
                            <button className="primary" onClick={saveEdit}>
                              保存
                            </button>
                            <button className="outline" onClick={() => setEditing(null)}>
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="mono page">p.{c.evidencePage || '?'}</span>
                          <span>{c.studyDesign || '（缺设计）'}</span>
                          <span className="mono">N={c.sampleSize === '' ? '?' : c.sampleSize}</span>
                          <span className={'effect ' + (EFFECT_BADGE[c.effectDirection] || 'none')}>
                            {c.effectDirection || '（缺方向）'}
                          </span>
                          <span className="finding">{c.finding || ''}</span>
                          {!v.ok && (
                            <span className="pill bad" title={v.errors.map((e) => e.reason).join('；')}>
                              缺项
                            </span>
                          )}
                          {!frozen && (
                            <span className="row-actions">
                              <button
                                onClick={() =>
                                  setEditing({
                                    codingId: c.id,
                                    value: {
                                      studyDesign: c.studyDesign,
                                      sampleSize: c.sampleSize,
                                      effectDirection: c.effectDirection,
                                      evidencePage: c.evidencePage,
                                      finding: c.finding || '',
                                    },
                                  })
                                }
                              >
                                编辑
                              </button>
                              <button className="danger" onClick={() => removeCoding(c)}>
                                删除
                              </button>
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {showImport && (
        <Modal
          title="批量导入编码"
          crumb="BATCH IMPORT · 整批校验，任一不合格即整批拒绝"
          onClose={() => {
            setShowImport(false);
            setImportResult(null);
          }}
          wide
        >
          <p className="hint">
            首行表头，Tab / 逗号 / 分号分隔。列：标题、作者、年份、出版物、研究设计、样本量、效应方向、证据页码、发现。
            研究设计与效应方向支持常见别名（如 RCT/随机对照、positive/正向）。
          </p>
          <textarea
            className="import-box"
            rows="8"
            placeholder={'标题\t作者\t年份\t研究设计\t样本量\t效应方向\t证据页码\t发现\nExercise and Cognition\tWang, L.\t2021\tRCT\t120\t阳性\t45\t干预组记忆显著提升'}
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportResult(null);
            }}
          />
          {importResult && !importResult.ok && (
            <div className="reject-box">
              <strong>✕ 整批拒绝（{importResult.count ?? 0} 条记录未写入任何数据）</strong>
              {importResult.parseErrors.map((e, i) => (
                <p key={i} className="reason">
                  第 {e.line} 行：{e.reason}
                  {e.raw ? `（原值：${e.raw}）` : ''}
                </p>
              ))}
              {importResult.issues?.length > 0 && <IssueTable issues={importResult.issues} />}
            </div>
          )}
          {importResult?.ok && (
            <div className="accept-box">
              ✓ 预检通过：{importResult.count} 条记录全部合规，可写入。
            </div>
          )}
          <div className="row-actions end">
            <button className="outline" onClick={() => runImport(false)}>
              预检
            </button>
            <button className="primary" onClick={() => runImport(true)}>
              校验并写入
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------- 视图三：证据矩阵 ----------
function MatrixView({ papers, frozen, draft, showToast, onAdjust }) {
  const verdict = useMemo(() => evaluateBatch(papers), [papers]);
  const matrix = useMemo(() => buildMatrix(papers), [papers]);

  const doFreeze = () => {
    const r = store.freeze();
    if (!r.ok) {
      showToast(`整批拒绝：${r.issues.length} 处问题未处理，未生成版本`, 'err');
    } else {
      showToast(`矩阵已冻结为 v${r.version}（${r.matrix.total} 条编码 / ${r.matrix.papers} 篇文献）`);
    }
  };

  const doWithdraw = () => {
    if (!window.confirm('撤回将丢弃当前调整版本的全部修改，回到最近冻结版。继续？')) return;
    const r = store.withdraw();
    if (r.ok) showToast(`已撤回，回到冻结版 v${r.version}`);
    else showToast(r.error, 'err');
  };

  return (
    <>
      <header>
        <div>
          <span className="crumb">REVIEW / MATRIX</span>
          <h1>证据矩阵</h1>
        </div>
        <div className="actions">
          {draft && draft.baseVersion > 0 && (
            <button className="outline danger-text" onClick={doWithdraw}>
              ↩ 撤回到 v{draft.baseVersion}
            </button>
          )}
          {!frozen && (
            <button className="primary" onClick={doFreeze}>
              ❄ 冻结矩阵{draft?.version ? `（生成 v${draft.version}）` : ''}
            </button>
          )}
          {frozen && (
            <button className="primary" onClick={onAdjust}>
              ＋ 带原因新建版本
            </button>
          )}
        </div>
      </header>

      {frozen && <FrozenBanner onAdjust={onAdjust} />}

      <div className="matrix-page">
        {!verdict.eligible && !frozen && (
          <div className="reject-box">
            <strong>✕ 整批拒绝：{verdict.issues.length} 处问题未处理，矩阵不能冻结</strong>
            <p className="hint">
              以下列出篇名、页码与原值；逐条处理后重新冻结。缺任一项（研究设计 / 样本量 / 效应方向 /
              证据页码）的编码不会进入合并。
            </p>
            <IssueTable issues={verdict.issues} />
          </div>
        )}

        {verdict.eligible && !frozen && (
          <div className="accept-box">✓ 全部编码合规，可以冻结。冻结后编码只读。</div>
        )}

        <div className="stat-row">
          <div className="stat">
            <small>纳入文献</small>
            <strong>{matrix.papers}</strong>
          </div>
          <div className="stat">
            <small>合并编码</small>
            <strong>{matrix.total}</strong>
          </div>
          {EFFECTS.map((d) => (
            <div className="stat" key={d}>
              <small>{d}</small>
              <strong className={'effect ' + EFFECT_BADGE[d]}>{matrix.tally[d]}</strong>
            </div>
          ))}
        </div>

        <table className="matrix-table">
          <thead>
            <tr>
              <th>篇名</th>
              <th>研究设计</th>
              <th>样本量</th>
              <th>效应方向</th>
              <th>证据页码</th>
              <th>结论摘录</th>
              <th>分歧说明</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((r, i) => (
              <tr key={i}>
                <td className="t-title">
                  {r.title}
                  <small>
                    {r.authors} · {r.year}
                  </small>
                </td>
                <td>{r.studyDesign}</td>
                <td className="mono">{r.sampleSize}</td>
                <td>
                  <span className={'effect ' + EFFECT_BADGE[r.effectDirection]}>
                    {r.effectDirection}
                  </span>
                </td>
                <td className="mono">p.{r.evidencePage}</td>
                <td className="finding">{r.finding || '—'}</td>
                <td className="finding">{r.disagreement || '—'}</td>
              </tr>
            ))}
            {!matrix.rows.length && (
              <tr>
                <td colSpan="7" className="no-result">
                  暂无合规编码进入合并
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------- 视图四：版本 ----------
function VersionsView({ papers, showToast }) {
  const state = store.getState();
  const integrity = store.integrity;
  const [viewing, setViewing] = useState(null);

  const snap = viewing !== null ? state.versions.find((v) => v.version === viewing) : null;
  const snapMatrix = snap ? buildMatrix(snap.snapshot) : null;

  return (
    <>
      <header>
        <div>
          <span className="crumb">REVIEW / VERSIONS</span>
          <h1>版本与一致性</h1>
        </div>
      </header>
      <div className="matrix-page">
        <div className={'integrity ' + (integrity.ok ? 'ok' : 'bad')}>
          {integrity.ok ? '✓' : '✕'} 刷新一致性校验：
          {integrity.ok
            ? `文献、编码、矩阵与 ${state.versions.length} 个冻结版本一致（当前合并 ${integrity.liveRows} 条编码）`
            : integrity.versionReports.map((r) => `v${r.version}：${r.reason}`).join('；')}
          <small className="mono dim"> {integrity.checkedAt}</small>
        </div>

        <div className="detail-section">
          <h4>
            当前状态 <span>STATE</span>
          </h4>
          {state.draft ? (
            <p>
              草稿版本 <strong>v{state.draft.version}</strong>
              {state.draft.baseVersion > 0
                ? `（基于冻结版 v${state.draft.baseVersion}，原因：${state.draft.reason}）`
                : '（初始编码，尚未冻结）'}
              ，可编辑。
            </p>
          ) : (
            <p>
              已冻结在 <strong>v{store.latestVersion()}</strong>，编码只读；调整须带原因新建版本，撤回仅回到最近冻结版。
            </p>
          )}
        </div>

        <div className="detail-section">
          <h4>
            冻结历史 <span>{state.versions.length} 个版本</span>
          </h4>
          {!state.versions.length && <p className="dim">尚未冻结任何版本。</p>}
          {[...state.versions].reverse().map((v) => (
            <div className="version-card" key={v.version}>
              <div className="version-head">
                <strong>v{v.version}</strong>
                <span className="mono dim">{v.frozenAt}</span>
                <span>
                  {v.summary.papers} 篇 · {v.summary.total} 条编码 · 阳性{v.summary.tally['阳性']} /
                  阴性{v.summary.tally['阴性']} / 无效应{v.summary.tally['无效应']} / 混合
                  {v.summary.tally['混合']}
                </span>
                <button className="outline" onClick={() => setViewing(viewing === v.version ? null : v.version)}>
                  {viewing === v.version ? '收起' : '查看快照'}
                </button>
              </div>
              <p className="reason">冻结原因：{v.reason}</p>
              {v.audit?.length > 0 && (
                <details>
                  <summary>调整审计（{v.audit.length} 条）</summary>
                  <ul className="audit">
                    {v.audit.map((a, i) => (
                      <li key={i}>
                        <span className="mono dim">{a.at}</span> {a.action}
                        {a.page ? ` · p.${a.page}` : ''}
                        {a.reason ? ` · 原因：${a.reason}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {viewing === v.version && snapMatrix && (
                <table className="matrix-table snapshot">
                  <thead>
                    <tr>
                      <th>篇名</th>
                      <th>研究设计</th>
                      <th>样本量</th>
                      <th>效应方向</th>
                      <th>证据页码</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapMatrix.rows.map((r, i) => (
                      <tr key={i}>
                        <td className="t-title">{r.title}</td>
                        <td>{r.studyDesign}</td>
                        <td className="mono">{r.sampleSize}</td>
                        <td>
                          <span className={'effect ' + EFFECT_BADGE[r.effectDirection]}>
                            {r.effectDirection}
                          </span>
                        </td>
                        <td className="mono">p.{r.evidencePage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- 壳 ----------
function App() {
  const state = useStore();
  const [view, setView] = useState('library');
  const [toast, showToast] = useToast();
  const [adjustReason, setAdjustReason] = useState('');
  const [showAdjust, setShowAdjust] = useState(false);

  const frozen = store.isFrozen();
  const papers = state.papers;
  const conflicts = findEffectConflicts(papers).length;
  const verdict = evaluateBatch(papers);

  const startAdjust = () => {
    const r = store.startAdjustment(adjustReason);
    if (!r.ok) return showToast(r.error, 'err');
    setShowAdjust(false);
    setAdjustReason('');
    showToast(`已开启调整版本 v${r.version}，编码恢复可编辑`);
  };

  const NAV = [
    ['library', '▤', '文献库', papers.length],
    ['coding', '✎', '编码台', papers.reduce((n, p) => n + p.codings.length, 0)],
    ['matrix', '▦', '证据矩阵', verdict.eligible ? '✓' : verdict.issues.length],
    ['versions', '⧉', '版本', state.versions.length],
  ];

  return (
    <div className="app">
      <aside>
        <div className="logo">
          <span>∴</span> EVIDENCE MATRIX
        </div>
        <div className="library-head">
          <span>系统综述证据矩阵台</span>
          <strong>
            {papers.length}
            <small> 篇文献</small>
          </strong>
        </div>
        <nav>
          {NAV.map(([key, icon, label, badge]) => (
            <button
              key={key}
              className={view === key ? 'active' : ''}
              onClick={() => setView(key)}
            >
              {icon} <span>{label}</span>
              <b>{badge}</b>
            </button>
          ))}
        </nav>
        <div className="side-tags">
          <small>规则</small>
          <button>四项缺一直接排除</button>
          <button>同页不得重复编码</button>
          <button>方向冲突须写分歧说明</button>
          <button>未处理 → 整批拒绝</button>
          {conflicts > 0 && <button className="warn-text">⚠ {conflicts} 篇存在方向冲突</button>}
        </div>
        <div className="side-foot">
          <small>{frozen ? `已冻结 · v${store.latestVersion()} · 只读` : state.draft?.baseVersion ? `调整中 · v${state.draft.version}` : '初始编码中'}</small>
          <small>本地数据库 · {store.integrity.ok ? '一致' : '异常'}</small>
        </div>
      </aside>
      <main>
        {view === 'library' && (
          <LibraryView papers={papers} frozen={frozen} showToast={showToast} onAdjust={() => setShowAdjust(true)} />
        )}
        {view === 'coding' && (
          <CodingView
            papers={papers}
            frozen={frozen}
            draft={state.draft}
            showToast={showToast}
            onAdjust={() => setShowAdjust(true)}
          />
        )}
        {view === 'matrix' && (
          <MatrixView
            papers={papers}
            frozen={frozen}
            draft={state.draft}
            showToast={showToast}
            onAdjust={() => setShowAdjust(true)}
          />
        )}
        {view === 'versions' && <VersionsView papers={papers} showToast={showToast} />}
      </main>

      {showAdjust && (
        <Modal title="新建调整版本" crumb="ADJUSTMENT · 必须登记原因" onClose={() => setShowAdjust(false)}>
          <p className="hint">
            将基于最近冻结版 v{store.latestVersion()} 开启 v{store.latestVersion() + 1}
            草稿；冻结前的全部编码修改都会记入审计。撤回仅回到最近冻结版。
          </p>
          <label>
            调整原因 *
            <textarea
              rows="3"
              placeholder="例如：纳入 2024 年新增队列研究；更正 p.45 效应方向误录…"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
            />
          </label>
          <button className="primary full" onClick={startAdjust}>
            开启新版本
          </button>
        </Modal>
      )}

      {toast && <div className={'toast ' + toast.kind}>{toast.text}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);

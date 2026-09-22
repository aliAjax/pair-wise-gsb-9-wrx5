// 判定层规则测试：node --test（无需第三方依赖）
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBatch } from '../src/rules/validate.js';
import { parsePages, canonicalPages } from '../src/rules/pages.js';
import { buildMatrix, findDuplicateCodes } from '../src/rules/matrix.js';
import { reducer } from '../src/processing/reducer.js';
import { initialState } from '../src/data/storage.js';
import { MATRIX_STATUS } from '../src/data/constants.js';

const papers = initialState().papers;
const row = (patch = {}) => ({
  rowId: 1,
  paperId: 1,
  design: 'rct',
  sampleSize: '120',
  direction: 'positive',
  pages: '12',
  divergence: '',
  effectText: '',
  ...patch,
});

test('四项登记缺任一项 -> 整批拒绝且给出原值', () => {
  for (const f of ['design', 'sampleSize', 'direction', 'pages']) {
    const r = validateBatch([row({ [f]: '' })], papers, []);
    assert.equal(r.ok, false, `${f} 缺失应拒绝`);
    assert.ok(r.errors.some((e) => e.field === f));
    assert.equal(r.parsed.length, 0);
  }
});

test('合法批次通过并规范化页码', () => {
  const r = validateBatch([row({ pages: 'p.12-14, 18页' })], papers, []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.parsed[0].pages, ['12', '13', '14', '18']);
  assert.equal(r.parsed[0].sampleSize, 120);
});

test('样本量必须为 >=10 的整数', () => {
  assert.equal(validateBatch([row({ sampleSize: '9' })], papers, []).ok, false);
  assert.equal(validateBatch([row({ sampleSize: '12.5' })], papers, []).ok, false);
  assert.equal(validateBatch([row({ sampleSize: 'abc' })], papers, []).ok, false);
  assert.equal(validateBatch([row({ sampleSize: '10' })], papers, []).ok, true);
});

test('同一文献同一页：批内重复 -> 拒绝并列页码', () => {
  const r = validateBatch(
    [row({ pages: '12' }), row({ rowId: 2, pages: '12-13' })],
    papers,
    []
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.every((e) => e.code === 'DUPLICATE_BATCH'));
  assert.ok(r.errors.some((e) => e.page === '12'));
});

test('同一文献同一页：与库内已登记编码冲突 -> 拒绝', () => {
  const stored = [{ id: 1, paperId: 1, pages: ['12'], direction: 'positive' }];
  const r = validateBatch([row({ pages: '12' })], papers, stored);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === 'DUPLICATE_STORED'));
});

test('不同文献可使用相同页码', () => {
  const r = validateBatch(
    [row({ paperId: 1, pages: '12' }), row({ rowId: 2, paperId: 2, pages: '12' })],
    papers,
    []
  );
  assert.equal(r.ok, true);
});

test('效应方向冲突无分歧说明 -> 拒绝；有说明 -> 通过', () => {
  const stored = [{ id: 1, paperId: 1, direction: 'positive', pages: ['12'], divergence: '' }];
  const noReason = validateBatch(
    [row({ pages: '20', direction: 'negative' })],
    papers,
    stored
  );
  assert.equal(noReason.ok, false);
  assert.ok(noReason.errors.some((e) => e.code === 'CONFLICT'));

  const withReason = validateBatch(
    [row({ pages: '20', direction: 'negative', divergence: '结局指标不同：主效应正向，副作用反向' })],
    papers,
    stored
  );
  assert.equal(withReason.ok, true);
});

test('同一文献多页同方向不构成冲突', () => {
  const r = validateBatch(
    [row({ pages: '12' }), row({ rowId: 2, pages: '20' })],
    papers,
    []
  );
  assert.equal(r.ok, true);
});

test('拒绝报告包含篇名、页码与原值', () => {
  const r = validateBatch([row({ paperId: 2, pages: '12', sampleSize: '' })], papers, []);
  const e = r.errors.find((x) => x.field === 'sampleSize');
  assert.equal(e.title, 'Situated Learning');
  assert.equal(e.original, '');
  const dup = validateBatch(
    [row({ paperId: 2, pages: '12' }), row({ rowId: 2, paperId: 2, pages: '12' })],
    papers,
    []
  );
  assert.ok(dup.errors[0].page);
});

test('页码解析与折叠', () => {
  assert.deepEqual(parsePages('12, 13, 15').keys, ['12', '13', '15']);
  assert.equal(canonicalPages(['12', '13', '14', '18']), '12-14, 18');
  assert.deepEqual(parsePages('abc; pp.5').invalidTokens, ['abc']);
  assert.deepEqual(parsePages('20–18').keys, ['18', '19', '20']);
});

test('矩阵：未编码文献 eligible=false，样本池只计完整编码', () => {
  const codes = [{ id: 1, paperId: 1, design: 'rct', sampleSize: 120, direction: 'positive', pages: ['12'], divergence: '' }];
  const { rows, stats } = buildMatrix(papers, codes);
  assert.equal(rows[0].eligible, true);
  assert.equal(rows[1].eligible, false);
  assert.equal(stats.coded, 1);
  assert.equal(stats.uncoded, 2);
  assert.equal(stats.samplePool, 120);
});

test('矩阵冲突标记与未说明冲突识别', () => {
  const codes = [
    { id: 1, paperId: 1, design: 'rct', sampleSize: 100, direction: 'positive', pages: ['12'], divergence: '' },
    { id: 2, paperId: 1, design: 'rct', sampleSize: 40, direction: 'negative', pages: ['20'], divergence: '' },
  ];
  let { rows } = buildMatrix(papers, codes);
  assert.equal(rows[0].conflict, true);
  assert.equal(rows[0].unexplainedConflict, true);
  codes[1].divergence = '不同结局';
  ({ rows } = buildMatrix(papers, codes));
  // 冲突说明逐编码要求：两条冲突编码都带说明才算已说明
  assert.equal(rows[0].unexplainedConflict, true);
  codes[0].divergence = '主效应指标，正向显著';
  ({ rows } = buildMatrix(papers, codes));
  assert.equal(rows[0].unexplainedConflict, false);
});

test('findDuplicateCodes 暴露同页重复', () => {
  const codes = [
    { id: 1, paperId: 1, pages: ['12'] },
    { id: 2, paperId: 1, pages: ['12'] },
  ];
  assert.equal(findDuplicateCodes(codes).codeId, 2);
});

// ---------- 状态机 / 版本 ----------
const seedOne = () =>
  reducer(initialState(), {
    type: 'code/submitBatch',
    payload: { rows: [row()] },
  });

test('冻结后编码只读：提交与删除被拒', () => {
  let s = seedOne();
  s = reducer(s, { type: 'matrix/freeze', payload: { reason: '首次冻结' } });
  assert.equal(s.status, MATRIX_STATUS.FROZEN);
  const afterSubmit = reducer(s, {
    type: 'code/submitBatch',
    payload: { rows: [row({ rowId: 9, pages: '30' })] },
  });
  assert.equal(afterSubmit.codes.length, 1);
  const afterDelete = reducer(s, { type: 'code/delete', payload: { id: 1 } });
  assert.equal(afterDelete.codes.length, 1);
});

test('调整须带原因；调整后编码以冻结版为基线', () => {
  let s = seedOne();
  s = reducer(s, { type: 'matrix/freeze', payload: {} });
  // 无原因拒绝
  const noReason = reducer(s, { type: 'matrix/adjust', payload: { reason: '  ' } });
  assert.equal(noReason.status, MATRIX_STATUS.FROZEN);
  // 有原因 -> 草稿新版本
  const adj = reducer(s, { type: 'matrix/adjust', payload: { reason: '补编码' } });
  assert.equal(adj.status, MATRIX_STATUS.DRAFT);
  assert.equal(adj.seq.version, 2);
  assert.equal(adj.versions.length, 2);
  assert.equal(adj.versions[1].reason, '补编码');
  assert.equal(adj.versions[1].baseVersion, 1);
  // 草稿期可写入
  const added = reducer(adj, {
    type: 'code/submitBatch',
    payload: { rows: [row({ rowId: 5, pages: '30' })] },
  });
  assert.equal(added.codes.length, 2);
});

test('撤回仅回到最近冻结版（丢弃草稿改动）', () => {
  let s = seedOne();
  s = reducer(s, { type: 'matrix/freeze', payload: {} });
  s = reducer(s, { type: 'matrix/adjust', payload: { reason: '改' } });
  s = reducer(s, {
    type: 'code/submitBatch',
    payload: { rows: [row({ rowId: 5, pages: '30' })] },
  });
  assert.equal(s.codes.length, 2);
  const w = reducer(s, { type: 'matrix/withdraw' });
  assert.equal(w.status, MATRIX_STATUS.FROZEN);
  assert.equal(w.codes.length, 1);
  // 已是冻结态时不能再次撤回
  assert.equal(reducer(w, { type: 'matrix/withdraw' }), w);
});

test('再次冻结生成 v2，撤回目标是最近冻结版', () => {
  let s = seedOne();
  s = reducer(s, { type: 'matrix/freeze', payload: {} });
  s = reducer(s, { type: 'matrix/adjust', payload: { reason: '补 p30' } });
  s = reducer(s, {
    type: 'code/submitBatch',
    payload: { rows: [row({ rowId: 5, pages: '30' })] },
  });
  s = reducer(s, { type: 'matrix/freeze', payload: { reason: '二轮' } });
  assert.equal(s.status, MATRIX_STATUS.FROZEN);
  assert.equal(s.seq.version, 3); // v1冻结、v2调整事件、v3二次冻结
  assert.equal(s.codes.length, 2);
  assert.equal(s.versions.filter((v) => v.type === 'freeze').length, 2);
  s = reducer(s, { type: 'matrix/adjust', payload: { reason: '再改' } });
  // 调整版以最近冻结版为基线，编码 id 与内容随快照保留
  assert.deepEqual(s.codes.map((c) => c.id), [2, 3]);
  s = reducer(s, { type: 'code/delete', payload: { id: 3 } });
  assert.equal(s.codes.length, 1);
  const w = reducer(s, { type: 'matrix/withdraw' });
  assert.equal(w.codes.length, 2); // 回到最近冻结版(v3)而非 v1
  // 当前指向的冻结快照为 v3（seq.version 为单调事件号，撤回不回退计数）
  assert.equal(w.versions.filter((v) => v.type === 'freeze').length, 2);
  assert.equal(Math.max(...w.versions.filter((v) => v.type === 'freeze').map((v) => v.version)), 3);
});

test('空矩阵禁止冻结；冲突无分歧说明禁止冻结', () => {
  assert.equal(reducer(initialState(), { type: 'matrix/freeze', payload: {} }).status, MATRIX_STATUS.DRAFT);
  let s = reducer(initialState(), {
    type: 'code/submitBatch',
    payload: { rows: [row()] },
  });
  s = reducer(s, {
    type: 'code/submitBatch',
    payload: { rows: [row({ rowId: 2, pages: '20', direction: 'negative' })] },
  });
  // 该批次本身因冲突无说明已被拒，库里只有一条；直接构造冲突状态验证守卫
  s.codes.push({ id: 99, paperId: 1, design: 'rct', sampleSize: 30, direction: 'negative', pages: ['21'], divergence: '' });
  assert.equal(reducer(s, { type: 'matrix/freeze', payload: {} }).status, MATRIX_STATUS.DRAFT);
});

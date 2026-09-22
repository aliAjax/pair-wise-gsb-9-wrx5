// 数据层：领域枚举与规则常量（纯数据，无副作用）

// 研究设计（受控词表）
export const RESEARCH_DESIGNS = [
  { value: 'rct', label: '随机对照试验 (RCT)' },
  { value: 'cohort', label: '队列研究' },
  { value: 'case-control', label: '病例对照研究' },
  { value: 'cross-sectional', label: '横断面研究' },
  { value: 'quasi-experiment', label: '准实验研究' },
  { value: 'qualitative', label: '定性研究' },
  { value: 'mixed-methods', label: '混合方法研究' },
  { value: 'case-study', label: '个案研究' },
  { value: 'secondary', label: '二手数据 / 元分析' },
  { value: 'other', label: '其他设计' },
];

// 效应方向（受控词表）
export const EFFECT_DIRECTIONS = [
  { value: 'positive', label: '正向（支持假设）', symbol: '＋' },
  { value: 'negative', label: '负向（反向）', symbol: '－' },
  { value: 'null', label: '零结果（不显著）', symbol: '○' },
  { value: 'mixed', label: '混合方向', symbol: '～' },
];

export const MATRIX_STATUS = { DRAFT: 'draft', FROZEN: 'frozen' };
export const VERSION_TYPE = { FREEZE: 'freeze', ADJUST: 'adjust' };

export const designLabel = (v) => RESEARCH_DESIGNS.find((d) => d.value === v)?.label || v || '—';
export const directionOf = (v) => EFFECT_DIRECTIONS.find((d) => d.value === v);
export const directionLabel = (v) => directionOf(v)?.label || '—';
export const directionSymbol = (v) => directionOf(v)?.symbol || '?';

// 领域层 · 常量：受控词表与存储键
// 界面、判定、解析三处共用，避免口径漂移

export const STORAGE_KEY = 'evidence-matrix-v1';
export const LEGACY_KEY = 'research-library';
export const SCHEMA_VERSION = 1;

// 研究设计受控词表
export const DESIGNS = [
  'RCT',
  '队列研究',
  '病例对照',
  '横断面',
  '质性研究',
  '混合方法',
  '其他',
];

// 效应方向受控词表
export const EFFECTS = ['阳性', '阴性', '无效应', '混合'];

// 批量导入时的研究设计别名 → 受控词表
export const DESIGN_ALIASES = {
  rct: 'RCT',
  '随机对照': 'RCT',
  '随机对照试验': 'RCT',
  '随机对照研究': 'RCT',
  randomized: 'RCT',
  'randomized controlled trial': 'RCT',
  队列: '队列研究',
  队列研究: '队列研究',
  cohort: '队列研究',
  '病例-对照': '病例对照',
  病例对照: '病例对照',
  'case-control': '病例对照',
  casecontrol: '病例对照',
  横断面: '横断面',
  横断面研究: '横断面',
  横断研究: '横断面',
  crosssectional: '横断面',
  'cross-sectional': '横断面',
  质性: '质性研究',
  质性研究: '质性研究',
  定性: '质性研究',
  qualitative: '质性研究',
  混合: '混合方法',
  混合方法: '混合方法',
  混合研究: '混合方法',
  mixedmethod: '混合方法',
  'mixed-method': '混合方法',
  'mixed methods': '混合方法',
};

// 批量导入时的效应方向别名 → 受控词表
export const EFFECT_ALIASES = {
  阳性: '阳性',
  正: '阳性',
  正向: '阳性',
  积极: '阳性',
  支持: '阳性',
  显著正: '阳性',
  positive: '阳性',
  pos: '阳性',
  '+': '阳性',
  '＋': '阳性',
  阴性: '阴性',
  负: '阴性',
  负向: '阴性',
  消极: '阴性',
  反对: '阴性',
  显著负: '阴性',
  negative: '阴性',
  neg: '阴性',
  '-': '阴性',
  '－': '阴性',
  '—': '阴性',
  无效应: '无效应',
  无: '无效应',
  无差异: '无效应',
  不显著: '无效应',
  差异不显著: '无效应',
  null: '无效应',
  none: '无效应',
  'no effect': '无效应',
  'not significant': '无效应',
  ns: '无效应',
  混合: '混合',
  混合效应: '混合',
  方向不一: '混合',
  不一致: '混合',
  异质: '混合',
  mixed: '混合',
};

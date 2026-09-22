// 判定层：证据页码规范化
// 支持 "12"、"p.12"、"12-15"、"12–15"、"12至15"、"12, 18"、"12；18页" 等写法

const RANGE_RE = /^(\d+)\s*(?:-|–|—|~|至)\s*(\d+)$/;

// 原始字符串 -> 去重排序后的页码键数组；无法解析的 token 通过 invalidTokens 返回
export function parsePages(raw = '') {
  const invalidTokens = [];
  const keys = new Set();
  const text = String(raw)
    .replace(/[；]/g, ';')
    .replace(/[，]/g, ',')
    .replace(/pp?\.?/gi, ' ')
    .replace(/页/g, ' ');
  const tokens = text
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      keys.add(String(parseInt(token, 10)));
      continue;
    }
    const m = token.match(RANGE_RE);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (b < a) [a, b] = [b, a];
      if (b - a > 5000) {
        invalidTokens.push(token);
        continue;
      }
      for (let p = a; p <= b; p++) keys.add(String(p));
      continue;
    }
    invalidTokens.push(token);
  }
  return { keys: [...keys].sort((x, y) => Number(x) - Number(y)), invalidTokens };
}

// 把连续页码折叠为区间形式，返回规范字符串，如 "12-15, 18"
export function canonicalPages(keys) {
  const nums = [...keys].map(Number).sort((a, b) => a - b);
  const runs = [];
  for (const n of nums) {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  return runs.map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(', ');
}

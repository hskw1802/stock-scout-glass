export const DEFAULT_PERIODS = [5, 25, 75];

export function validPeriods(periods) {
  return Array.isArray(periods) && periods.length === 3 && periods.every(n => Number.isInteger(n) && n >= 2 && n <= 120) && periods[0] < periods[1] && periods[1] < periods[2];
}

export function movingAverage(values, period) {
  let sum = 0;
  return values.map((v, i) => {
    sum += v;
    if (i >= period) sum -= values[i-period];
    return i < period-1 ? null : sum/period;
  });
}

export function analyze(stock, periods = DEFAULT_PERIODS) {
  if (!validPeriods(periods)) throw Error('移動平均の期間は 2〜120 の整数で、短期 < 中期 < 長期にしてください。');
  const prices = stock.closes;
  if (!Array.isArray(prices) || prices.length < periods[2]+1 || !prices.every(p => typeof p === 'number' && Number.isFinite(p) && p > 0)) throw Error('終値データが不足、または不正です。');
  if (!Number.isInteger(stock.lot) || stock.lot < 1) throw Error('売買単位が不正です。');
  const lines = periods.map(n => movingAverage(prices, n));
  const ma = lines.map(s => s.at(-1));
  const previous = lines.map(s => s.at(-2));
  const price = prices.at(-1);
  const cross = previous[0] <= previous[1] && ma[0] > ma[1];
  const checks = [
    { label: `${periods[0]}日線 > ${periods[1]}日線 > ${periods[2]}日線`, pass: ma[0] > ma[1] && ma[1] > ma[2] },
    { label: `${periods[1]}日線が上向き`, pass: ma[1] > previous[1] },
    { label: `終値 > ${periods[1]}日線`, pass: price > ma[1] },
  ];
  return { ...stock, price, lines, ma, cross, checks, candidate: checks.every(c => c.pass), change: (price/prices.at(-2)-1)*100, deviation: (price/ma[1]-1)*100 };
}

// Decimal strings -> fixed-point BigInt: never round the share count up.
export function calculateBudget(priceInput, amountInput, lot) {
  const parse = v => {
    const str = String(v).trim();
    if (!/^\d{1,14}(\.\d{1,6})?$/.test(str)) throw Error('予算は0以上、小数6桁までの数値を入力してください。');
    const [whole, fraction=''] = str.split('.');
    return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
  };
  const p = parse(priceInput), a = parse(amountInput);
  if (p <= 0n || !Number.isInteger(lot) || lot < 1) throw Error('価格・売買単位が不正です。');
  const shares = a/(p*BigInt(lot))*BigInt(lot);
  if (shares > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('計算できる株数の上限を超えています。');
  const cost = p*shares;
  const decimal = n => Number(n)/1000000;
  return { shares: Number(shares), cost: decimal(cost), remaining: decimal(a-cost) };
}

export function filterStocks(stocks, { tab='candidates', search='', sector='all', sort='deviation', watch=[] } = {}) {
  const query = search.trim().toLowerCase();
  const filtered = stocks.filter(s => (!query || `${s.code} ${s.name}`.toLowerCase().includes(query)) && (sector==='all'||s.sector===sector) && (tab==='all'||tab==='candidates'&&s.candidate||tab==='cross'&&s.cross||tab==='watch'&&watch.includes(s.code)));
  return filtered.sort(sort==='change'?(a,b)=>b.change-a.change:sort==='code'?(a,b)=>a.code.localeCompare(b.code):(a,b)=>Math.abs(a.deviation)-Math.abs(b.deviation));
}

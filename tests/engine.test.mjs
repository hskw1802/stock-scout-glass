import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, calculateBudget, movingAverage, filterStocks, validPeriods } from '../dist/engine.js';
const stock = closes => ({ code:'TEST', name:'テスト', lot:100, closes });
test('移動平均は期間未満をnullにする', () => assert.deepEqual(movingAverage([1,2,3,4],3), [null,null,2,3]));
test('上昇トレンドの移動平均と候補判定', () => {
  const s = analyze(stock(Array.from({length:100},(_,i)=>i+1)));
  assert.deepEqual(s.ma,[98,88,63]); assert.equal(s.candidate,true); assert.equal(s.cross,false);
});
test('下落・横ばいは候補にしない', () => {
  assert.equal(analyze(stock(Array.from({length:100},(_,i)=>100-i))).candidate,false);
  assert.equal(analyze(stock(Array(100).fill(100))).candidate,false);
});
test('上抜けは前日の線も比較する', () => {
  assert.equal(analyze(stock([...Array(99).fill(100),110])).cross,true);
  assert.equal(analyze(stock(Array(100).fill(100))).cross,false);
});
test('期間と欠損の検証', () => {
  assert.equal(validPeriods([25,5,75]),false);
  assert.throws(()=>analyze(stock(Array(75).fill(100))));
  assert.throws(()=>analyze(stock([...Array(99).fill(100),NaN])));
});
test('予算を超える株数に丸めない', () => {
  assert.deepEqual(calculateBudget('1234.5','300000',100),{shares:200,cost:246900,remaining:53100});
  assert.equal(calculateBudget('0.1','30',100).shares,300);
  assert.equal(calculateBudget('3000','0',100).shares,0);
  assert.equal(calculateBudget('3000','299999',100).shares,0);
  for (const amount of ['-1','','NaN','1e6']) assert.throws(()=>calculateBudget(100,amount,100));
  assert.throws(()=>calculateBudget('0.000001','99999999999999',1));
});
test('市場検索と保存銘柄の絞り込み', () => {
  const s = [analyze({...stock(Array.from({length:100},(_,i)=>100+i)),code:'TEST1'})];
  assert.equal(filterStocks(s,{tab:'all',search:'TEST1'}).length,1);
  assert.equal(filterStocks(s,{tab:'watch',watch:['TEST1']})[0].code,'TEST1');
  assert.ok(filterStocks(s).every(x=>x.candidate));
});

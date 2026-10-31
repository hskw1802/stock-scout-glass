import { analyze, calculateBudget, makeDemo, filterStocks, validPeriods, DEFAULT_PERIODS } from './engine.js';

const $ = id => document.getElementById(id);
const icons = {
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  settings:'<path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  scan:'<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M8 12l3 3 5-6"/>',
  trend:'<path d="m3 17 6-6 4 3 8-10M15 4h6v6"/>',
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  'arrow-right':'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  'arrow-up-right':'<path d="M6 18 18 6M6 6h12v12"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  sort:'<path d="M8 4v16m-4-4 4 4 4-4M16 4h5m-5 5h4m-4 5h3"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  calculator:'<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M8 6h8M8 11h1m6 0h1m-8 4h1m6 0h1m-8 4h1m6 0h1"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  minus:'<path d="M5 12h14"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.grid}</svg>`;
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (value,digits=0) => Number(value).toLocaleString('ja-JP',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const money = value => '¥'+num(value, Number.isInteger(Number(value))?0:1);
const pct = n => (n>0?'+':'')+n.toFixed(2)+'%';
const read = (key,fallback) => {try {return JSON.parse(localStorage.getItem('scout-'+key))??fallback;} catch {return fallback;}};
const write = (key,value) => {try {localStorage.setItem('scout-'+key,JSON.stringify(value));} catch {}}
let savedPeriods = read('periods', DEFAULT_PERIODS);
let periods = validPeriods(savedPeriods)?savedPeriods:DEFAULT_PERIODS;
let watch = read('watch',[]); if (!Array.isArray(watch)) watch=[];
let amount = read('budget','300000');
let reduced = read('reduced',false)===true;
let dataset, stocks=[], visible=[], selected, range=66, activeTab='candidates', refreshing=false, toastTimer, chartPosition=0;
let chartData;
const reduceMotion = () => reduced || matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.toggle('reduced-motion',reduced);
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
document.querySelector('.workspace').insertBefore($('detail-scrim'),$('detail-panel'));

function toast(message) {
  $('toast').textContent=message; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);
}

function countTo(el,target) {
  if (reduceMotion()) {el.textContent=num(target);return;}
  const start=performance.now(),duration=700;
  function tick(now){const t=Math.min(1,(now-start)/duration);el.textContent=num(Math.round(target*(1-Math.pow(1-t,3))));if(t<1)requestAnimationFrame(tick);}
  requestAnimationFrame(tick);
}

function updateMetrics(animate=true) {
  const candidates=stocks.filter(s=>s.candidate).length,cross=stocks.filter(s=>s.cross).length;
  for (const [id,value] of [['metric-total',stocks.length],['metric-candidate',candidates],['metric-cross',cross],['metric-watch',stocks.filter(s=>watch.includes(s.code)).length]]) {
    if(animate)countTo($(id),value);else $(id).textContent=num(value);
  }
  $('ratio').textContent=(candidates/stocks.length*100).toFixed(1)+'%';
  $('tab-count').textContent=candidates;
  $('cross-label').textContent=`${periods[0]}日線 / ${periods[1]}日線`;
  $('ma-heading').textContent=`${periods[1]}日線 / 乖離率`;
  $('rule-summary').textContent=periods.map(n=>`${n}日`).join(' > ');
}

async function load(initial=false) {
  if (refreshing) return;
  refreshing=true;$('refresh').disabled=true;$('refresh').classList.add('is-refreshing');
  $('loading').classList.remove('done');$('app').setAttribute('aria-busy','true');$('app').inert=true;
  try {
    // This delay makes the requested skeleton visible for the local demo only.
    await new Promise(resolve=>setTimeout(resolve,reduceMotion()?80:initial?850:550));
    dataset=makeDemo();stocks=dataset.stocks.map(s=>analyze(s,periods));
    if(initial){
      [...new Set(stocks.map(s=>s.sector))].forEach(sector=>{
        const option=document.createElement('option');option.value=sector;option.textContent=sector;$('sector').append(option);
      });
    }
    updateMetrics();renderList(true);
    $('last-update').textContent='表示更新 '+new Date().toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
  } catch (e) {
    showInfo('読み込みエラー',`<p class="info-note">${escape(e.message)}</p>`);
  } finally {
    refreshing=false;$('refresh').disabled=false;$('refresh').classList.remove('is-refreshing');
    $('app').inert=false;$('app').setAttribute('aria-busy','false');$('loading').classList.add('done');
    requestAnimationFrame(positionIndicator);
  }
}

function spark(prices, positive) {
  const values=prices.slice(-22),min=Math.min(...values),max=Math.max(...values),span=max-min||1;
  const points=values.map((p,i)=>(i?'L':'M')+(2+i/(values.length-1)*63).toFixed(1)+','+(25-(p-min)/span*21).toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 67 29" aria-hidden="true"><path d="${points}" stroke="${positive?'#85b5a7':'#d3a1ab'}"/></svg>`;
}

function renderList(selectFirst=false) {
  visible=filterStocks(stocks,{tab:activeTab,search:$('search').value,sector:$('sector').value,sort:$('sort').value,watch});
  if(selectFirst||!selected||!visible.some(s=>s.code===selected.code))selected=visible[0]||null;
  $('rows').innerHTML=visible.map((s,i)=>`<tr class="stock-row${s.code===selected?.code?' selected':''}" data-code="${escape(s.code)}" tabindex="0" aria-label="${escape(s.name)}の詳細" style="--i:${Math.min(i,10)}"><td class="favorite-col"><button class="icon-button${watch.includes(s.code)?' saved':''}" data-save="${escape(s.code)}" aria-label="${escape(s.name)}${watch.includes(s.code)?'の保存を解除':'を保存'}" aria-pressed="${watch.includes(s.code)}">${icon('star')}</button></td><td><strong>${escape(s.name)}</strong><small>${escape(s.code)} · ${escape(s.sector)}</small></td><td class="numeric"><strong>${num(s.price,1)}</strong><span class="change ${s.change>=0?'positive':'negative'}">${pct(s.change)}</span></td><td class="spark-col">${spark(s.closes,s.closes.at(-1)>=s.closes.at(-22))}</td><td class="numeric ma-col">${num(s.ma[1],1)}<small>${pct(s.deviation)}</small></td><td class="state-col"><span class="state-chip${s.candidate?'':s.cross?' cross':' inactive'}">${s.candidate?'条件合致':s.cross?'上抜け':'対象外'}</span></td></tr>`).join('');
  $('empty').hidden=visible.length>0;
  $('visible-count').textContent=`${num(visible.length)} / ${num(stocks.length)} 銘柄`;
  renderDetail();
}

function positionIndicator() {
  const tab=document.querySelector('[role=tab][aria-selected=true]');
  const indicator=document.querySelector('.segment-indicator');
  if(tab){indicator.style.width=tab.offsetWidth+'px';indicator.style.transform=`translateX(${tab.offsetLeft-4}px)`;}
}

function setTab(tab) {
  activeTab=tab;
  document.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===tab)));
  $('page-title').textContent=tab==='watch'?'保存銘柄':'スクリーニング';
  positionIndicator();renderList(true);
}

function toggleWatch(code) {
  const exists=watch.includes(code);watch=exists?watch.filter(x=>x!==code):[...watch,code];write('watch',watch);
  updateMetrics(false);renderList();toast(exists?'保存を解除しました':'銘柄を保存しました');
  if(!reduceMotion())$('metric-watch').animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:400,easing:'ease-out'});
}

function renderDetail() {
  const s=selected;
  $('detail-watch').disabled=!s;$('budget-btn').disabled=!s;
  if(!s){$('stock-meta').textContent='—';$('stock-name').textContent='銘柄を選択';$('stock-price').textContent='—';$('stock-change').textContent='';$('chart').replaceChildren();$('ma-values').replaceChildren();$('ma-legend').replaceChildren();$('checks').replaceChildren();$('result-badge').textContent='—';chartData=null;$('chart-tooltip').hidden=true;return;}
  $('stock-meta').textContent=`${s.code} / ${s.sector}`;$('stock-name').textContent=s.name;
  $('stock-price').textContent=num(s.price,1);$('stock-change').textContent=pct(s.change);$('stock-change').className='quote-change '+(s.change>=0?'positive':'negative');
  $('detail-watch').classList.toggle('saved',watch.includes(s.code));$('detail-watch').setAttribute('aria-label',watch.includes(s.code)?'選択銘柄の保存を解除':'選択銘柄を保存');$('detail-watch').setAttribute('aria-pressed',String(watch.includes(s.code)));
  $('ma-values').innerHTML=periods.map((n,i)=>`<div class="ma-value"><span>${n}日線</span><strong>${num(s.ma[i],1)}</strong></div>`).join('');
  const colors=['#5591f0','#d4ad6c','#aaa0d1'];
  $('ma-legend').innerHTML=`<span><i style="background:#c0c8d4"></i>終値</span>`+periods.map((n,i)=>`<span><i style="background:${colors[i]}"></i>${n}日</span>`).join('');
  $('checks').innerHTML=s.checks.map(c=>`<div class="check-row"><span><i class="check-circle${c.pass?'':' fail'}">${icon(c.pass?'check':'minus')}</i>${escape(c.label)}</span><span class="check-state">${c.pass?'一致':'不一致'}</span></div>`).join('');
  $('result-badge').textContent=s.candidate?'条件合致':'条件外';$('result-badge').classList.toggle('off',!s.candidate);
  $('budget-preview').textContent=money(amount);renderChart();
  if(!reduceMotion())$('stock-name').animate([{opacity:.25,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:350,easing:'ease-out'});
}

function renderChart() {
  const s=selected;if(!s)return;
  const start=Math.max(0,s.closes.length-range),values=s.closes.slice(start),series=[values,...s.lines.map(line=>line.slice(start))];
  const all=series.flat().filter(x=>x!==null),lo=Math.min(...all),hi=Math.max(...all),span=hi-lo||1;
  const x=i=>8+i/(values.length-1)*368,y=v=>169-(v-lo)/span*145;
  let html='<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#73a7f4" stop-opacity=".12"/><stop offset="1" stop-color="#73a7f4" stop-opacity="0"/></linearGradient></defs>';
  for(let i=0;i<4;i++){const yy=24+i*48.33;html+=`<line class="chart-grid" x1="8" x2="382" y1="${yy}" y2="${yy}"/><text class="chart-label" x="439" y="${yy+3}" text-anchor="end">${num(hi-i*span/3)}</text>`;}
  const linePath=values.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+','+y(v).toFixed(1)).join('');
  html+=`<path class="chart-area" d="${linePath}L376,178L8,178Z" fill="url(#area)"/>`;
  series.forEach((arr,j)=>{let first=true;const d=arr.map((v,i)=>{if(v===null)return '';const result=(first?'M':'L')+x(i).toFixed(1)+','+y(v).toFixed(1);first=false;return result;}).join('');html+=`<path class="chart-line" d="${d}" stroke="${['#bdc9d8','#5591f0','#d4ad6c','#aaa0d1'][j]}" style="animation-delay:${j*60}ms;stroke-width:${j?1.8:1.2}"/>`;});
  for(const fraction of [0,.33,.66,1]){const i=Math.round((values.length-1)*fraction);html+=`<text class="chart-label" x="${x(i)}" y="204" text-anchor="${fraction===0?'start':fraction===1?'end':'middle'}">${escape(s.dates[start+i].slice(5).replace('-','/'))}</text>`;}
  html+='<g id="crosshair" visibility="hidden"><line id="crosshair-line" y1="10" y2="178" stroke="#9eb9df" stroke-width="1" stroke-dasharray="3 4"/><circle id="crosshair-dot" r="4" fill="#6d9fe8" stroke="white" stroke-width="2"/></g>';
  $('chart').innerHTML=html;$('chart').setAttribute('aria-label',`${s.name}、直近${values.length}営業日の終値と${periods.join('・')}日移動平均。最終終値${num(s.price,1)}円。`);
  chartData={values,start,x,y};chartPosition=values.length-1;$('chart-tooltip').hidden=true;
}

function chartHover(index) {
  if(!chartData||!selected)return;
  const {values,start,x,y}=chartData;index=Math.max(0,Math.min(values.length-1,index));chartPosition=index;
  $('crosshair').setAttribute('visibility','visible');$('crosshair-line').setAttribute('x1',x(index));$('crosshair-line').setAttribute('x2',x(index));$('crosshair-dot').setAttribute('cx',x(index));$('crosshair-dot').setAttribute('cy',y(values[index]));
  $('chart-tooltip').innerHTML=escape(selected.dates[start+index])+`<br><strong>${num(values[index],1)} 円</strong>`;$('chart-tooltip').hidden=false;
}

function openDetail(code) {
  selected=stocks.find(s=>s.code===code);renderList();
  if(matchMedia('(max-width:760px)').matches){$('detail-panel').classList.add('open');$('detail-scrim').classList.add('open');document.body.classList.add('detail-open');$('detail-panel').setAttribute('role','dialog');$('detail-panel').setAttribute('aria-modal','true');setBackgroundInert(true);$('close-detail').focus({preventScroll:true});}
}
function setBackgroundInert(inert){document.querySelectorAll('.topbar,.page-heading,.data-strip,.metrics,.list-panel,.page-footer').forEach(el=>el.inert=inert);}
function closeDetail() {
  $('detail-panel').classList.remove('open');$('detail-scrim').classList.remove('open');document.body.classList.remove('detail-open');
  $('detail-panel').removeAttribute('role');$('detail-panel').removeAttribute('aria-modal');setBackgroundInert(false);
  const row=[...$('rows').children].find(r=>r.dataset.code===selected?.code);row?.focus({preventScroll:true});
}

function openDialog(id){const dialog=$(id);if(!dialog.open)dialog.showModal();}
function closeDialog(dialog){if(!dialog.open)return;if(reduceMotion()){dialog.close();return;}dialog.classList.add('closing');setTimeout(()=>{dialog.close();dialog.classList.remove('closing');},170);}
function showInfo(title,html){$('info-title').textContent=title;$('info-content').innerHTML=html;openDialog('info-dialog');}
function connectionInfo() {
  showInfo('接続状況',`<div class="info-row"><span>データ</span><strong>架空240銘柄</strong></div><div class="info-row"><span>実市場の網羅性</span><strong>未接続</strong></div><div class="info-row"><span>iPhoneプッシュ通知</span><strong>未接続</strong></div><div class="info-row"><span>バックグラウンド監視</span><strong>未稼働</strong></div><div class="info-row"><span>SBI購入画面への直接連携</span><strong>未接続</strong></div><p class="info-note">実際の株価は取得していません。無料で分析に利用できるデータ源の接続と、サーバー側の監視は別途必要です。画面を閉じると処理は止まります。通知の許可や口座へのログインは求めません。</p>`);
}

function updateBudget(){
  if(!selected)return;
  try {
    const next=$('budget-input').value.replaceAll(',','').trim();const result=calculateBudget(selected.price,next,selected.lot);
    amount=next;write('budget',amount);$('budget-error').textContent='';$('budget-preview').textContent=money(amount);
    $('estimate-shares').textContent=num(result.shares)+' 株';$('estimate-cost').textContent=money(result.cost);$('estimate-remaining').textContent='予算残 '+money(result.remaining);$('estimate-lot').textContent=selected.lot+'株単位';
  }catch(e){$('budget-error').textContent=e.message;$('estimate-shares').textContent='—';$('estimate-cost').textContent='—';$('estimate-remaining').textContent='';$('estimate-lot').textContent='';}
}

$('refresh').onclick=()=>load();
document.querySelectorAll('[data-tab]').forEach(button=>{
  button.onclick=()=>setTab(button.dataset.tab);
  button.onkeydown=e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('[data-tab]')],i=tabs.indexOf(button),next=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];setTab(next.dataset.tab);next.focus();};
});
$('rows').onclick=e=>{const save=e.target.closest('[data-save]');if(save){toggleWatch(save.dataset.save);return;}const row=e.target.closest('[data-code]');if(row)openDetail(row.dataset.code);};
$('rows').onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('tr[data-code]')){e.preventDefault();openDetail(e.target.dataset.code);}};
$('detail-watch').onclick=()=>selected&&toggleWatch(selected.code);
$('metric-watch-btn').onclick=()=>setTab('watch');
$('search').oninput=()=>renderList(true);$('sector').onchange=()=>renderList(true);$('sort').onchange=()=>renderList();
$('reset-filter').onclick=()=>{$('search').value='';$('sector').value='all';setTab('all');};
document.querySelectorAll('[data-range]').forEach(button=>button.onclick=()=>{range=Number(button.dataset.range);document.querySelectorAll('[data-range]').forEach(b=>b.classList.toggle('active',b===button));renderChart();});
$('chart').onpointermove=e=>{if(!chartData)return;const rect=$('chart').getBoundingClientRect(),pos=(e.clientX-rect.left)/rect.width*440;chartHover(Math.round((pos-8)/368*(chartData.values.length-1)));};
$('chart').onpointerleave=()=>{$('chart-tooltip').hidden=true;$('crosshair')?.setAttribute('visibility','hidden');};
$('chart').onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();chartHover(chartPosition+(e.key==='ArrowLeft'?-1:1));}};
$('chart').onblur=()=>{$('chart-tooltip').hidden=true;$('crosshair')?.setAttribute('visibility','hidden');};
$('close-detail').onclick=closeDetail;$('detail-scrim').onclick=closeDetail;
$('budget-btn').onclick=()=>{if(!selected)return;$('budget-stock').textContent=selected.name+' · '+selected.code+' / デモ終値 '+money(selected.price);$('budget-input').value=amount;updateBudget();openDialog('budget-dialog');};
$('budget-input').oninput=updateBudget;
document.querySelectorAll('[data-budget]').forEach(button=>button.onclick=()=>{$('budget-input').value=button.dataset.budget;updateBudget();});
$('settings-btn').onclick=()=>{['short-period','mid-period','long-period'].forEach((id,i)=>$(id).value=periods[i]);$('reduce-motion').checked=reduced;$('settings-error').textContent='';openDialog('settings-dialog');};
$('settings-form').onsubmit=e=>{e.preventDefault();const next=['short-period','mid-period','long-period'].map(id=>Number($(id).value));if(!validPeriods(next)){$('settings-error').textContent='短期 < 中期 < 長期の順に、2〜120日の整数を入力してください。';return;}periods=next;reduced=$('reduce-motion').checked;write('periods',periods);write('reduced',reduced);document.documentElement.classList.toggle('reduced-motion',reduced);stocks=dataset.stocks.map(s=>analyze(s,periods));selected=stocks.find(s=>s.code===selected?.code);updateMetrics(false);renderList();closeDialog($('settings-dialog'));toast('設定を保存しました');};
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>closeDialog($(button.dataset.close)));
document.querySelectorAll('dialog').forEach(dialog=>{dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog(dialog);});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(dialog);}});});
$('data-info').onclick=connectionInfo;$('notification-btn').onclick=connectionInfo;
$('method-btn').onclick=()=>showInfo('判定ルール',`<ol class="rule-list"><li>${periods[0]}日線 > ${periods[1]}日線 > ${periods[2]}日線</li><li>${periods[1]}日線が前日より上向き</li><li>終値が${periods[1]}日線より上</li></ol><p class="info-note">3条件すべてに一致する銘柄を候補に表示します。「上抜け」は前日の短期線 ≤ 中期線、当日の短期線 > 中期線です。計算は確定日足の単純移動平均を使用します。出来高・財務指標は未実装です。仮の判定ルールであり、収益性は未検証です。デモの日付は平日を割り当てており、取引所の祝日を反映していません。</p>`);
$('export').onclick=()=>{const payload={mode:'demo',asOf:dataset.asOf,coverage:dataset.coverage,periods,stocks:visible.map(({lines,...s})=>s)};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='stock-scout-demo.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`${visible.length}銘柄を書き出しました`);};
document.addEventListener('click',e=>{const button=e.target.closest('.button');if(!button||reduceMotion())return;const rect=button.getBoundingClientRect(),size=Math.max(rect.width,rect.height)*2;const ripple=document.createElement('span');ripple.className='ripple';ripple.style.cssText=`width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;button.append(ripple);setTimeout(()=>ripple.remove(),650);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('detail-open'))closeDetail();if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!document.querySelector('dialog[open]')&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('search').focus();}});
document.addEventListener('keydown',e=>{if(e.key!=='Tab'||!document.body.classList.contains('detail-open')||document.querySelector('dialog[open]'))return;const controls=[...$('detail-panel').querySelectorAll('button:not(:disabled),a[href],svg[tabindex]')].filter(el=>el.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
window.addEventListener('resize',()=>{positionIndicator();if(innerWidth>760&&document.body.classList.contains('detail-open'))closeDetail();});
load(true);

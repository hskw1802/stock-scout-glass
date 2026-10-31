// SBI公式銘柄詳細の「現物買」リンクに基づく。注文の送信は行わない。
export function sbiLinks(input){
  const symbol=String(input).trim().toUpperCase();
  if(!/^[0-9][0-9A-Z]{3}$/.test(symbol))throw Error('証券コードが不正です。');
  const buy=new URL('https://www.sbisec.co.jp/ETGate/');
  buy.search=new URLSearchParams({_ControlID:'WPLETstT002Control',_DataStoreID:'DSWPLETstT002Control',_PageID:'DefaultPID',getFlg:'on',_ActionID:'DefaultAID',stock_sec_code:symbol,market:'TKY',stock_sec_code_mul:symbol,mktlist:'TKY',trade_Market:''}).toString();
  const detail=new URL('https://www.sbisec.co.jp/ETGate/WPLETsiR001Control/WPLETsiR001Ilst30/getDetailOfStockPriceJP');
  detail.search=new URLSearchParams({OutSide:'on',exchange_code:'JPN',getFlg:'on',stock_sec_code_mul:symbol}).toString();
  return {buy:buy.href,detail:detail.href};
}
export function sbiActions(symbol){
  const urls=sbiLinks(symbol),group=document.createElement('div');group.className='sbi-actions';
  for(const [key,label,style] of [['buy','SBI証券で現物買 ↗','button primary'],['detail','SBIの銘柄詳細 ↗','button glass']]){
    const a=document.createElement('a');a.href=urls[key];a.textContent=label;a.className=style;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';a.setAttribute('aria-label',symbol+' '+label);group.append(a);
  }
  return group;
}

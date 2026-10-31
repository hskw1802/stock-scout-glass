const COOKIE = '__Host-scout_session';
const encoder = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const unb64 = text => Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')), c=>c.charCodeAt(0));
async function cryptoKey(secret) {
  if (!secret || secret.length<32) throw Error('サーバーの接続設定が未完了です。');
  return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function sealSession(apiKey,user,secret) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await cryptoKey(secret),encoder.encode(JSON.stringify({apiKey,user,expires:Date.now()+7200000})));
  return b64(iv)+'.'+b64(new Uint8Array(cipher));
}
export async function openSession(value,user,secret) {
  try {
    const [iv,cipher]=value.split('.');
    const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},await cryptoKey(secret),unb64(cipher));
    const session=JSON.parse(new TextDecoder().decode(bytes));
    return session.user===user&&session.expires>Date.now()?session:null;
  } catch { return null; }
}
const cookie = request => (request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
const baseHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...baseHeaders,'Content-Type':'application/json; charset=utf-8',...extra}});

export function createWorker(assets={},upstream=(...args)=>fetch(...args)) {
  const attempts=new Map();
  const dataAttempts=new Map();
  return {
    async fetch(request,env) {
      const secret=env?.SCOUT_COOKIE_SECRET||(typeof process!=='undefined'?process.env?.SCOUT_COOKIE_SECRET:undefined);
      const url=new URL(request.url);
      const user=request.headers.get('oai-authenticated-user-id');
      if(url.pathname.startsWith('/api/')) {
        if(!user)return json({error:'本人のログインが必要です。'},401);
        if(url.pathname==='/api/health'&&request.method==='GET') {
          try {const r=await upstream('https://api.zenithcode.net/stable/usage',{redirect:'manual'});return json({reachable:true,upstreamStatus:r.status});}
          catch{return json({reachable:false,code:'PROVIDER_UNREACHABLE'},502);}
        }
        if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return json({error:'同じ接続画面から操作してください。'},403);
        if(['/api/market','/api/history','/api/research'].includes(url.pathname)&&request.method==='POST') {
          const session=await openSession(cookie(request),user,secret);
          if(!session)return json({error:'接続期限が切れました。接続設定でキーを入力してください。'},401);
          const now=Date.now();const recent=(dataAttempts.get(user)||[]).filter(t=>now-t<60000);
          if(recent.length>=8)return json({error:'取得回数を抑えています。1分待って再試行してください。'},429);
          if(dataAttempts.size>100)dataAttempts.delete(dataAttempts.keys().next().value);
          dataAttempts.set(user,[...recent,now]);
          try {
            let research=null;
            let endpoint='screener?isEtf=false&sortBy=changePct1w&order=desc&limit=100';
            if(url.pathname==='/api/history') {
              const raw=await request.text();if(raw.length>100)return json({error:'入力が長すぎます。'},400);
              const symbol=String(JSON.parse(raw).symbol||'').toUpperCase();
              if(!/^[0-9][0-9A-Z]{3}$/.test(symbol))return json({error:'証券コードは4桁で入力してください。'},400);
              endpoint='historical-price-eod?symbol='+symbol;
            }
            if(url.pathname==='/api/research') {
              const raw=await request.text();if(raw.length>1000)return json({error:'入力が長すぎます。'},400);
              const researchInput=JSON.parse(raw);research=researchInput.kind;
              const endpoints={indices:'batch-quote?symbols=1321,1306',sectors:'sector-performance?period=1w&basis=weighted&order=desc',breadth:'market-breadth',sentiment:'fear-greed',catalog:'economic-indicators',fx:'economic-series?id=DEXJPUS&limit=8',rates:'economic-series?id=DGS10&limit=8',universe:'screener?isEtf=false&marketCapMoreThan=100000000000&perMoreThan=0&roeMoreThan=0&sortBy=changePct1w&order=desc&limit=100'};
              if(['news','newsRisk'].includes(research)) {
                const query=new URLSearchParams({query:research==='newsRisk'?'Japan (economy OR stocks OR yen) (tariff OR sanctions OR recession OR war OR "rate hike")':'Japan (economy OR stocks OR yen OR "Bank of Japan" OR tariff)',mode:'ArtList',format:'json',timespan:'3d',maxrecords:'40',sort:'DateDesc'});
                const c=new AbortController();const t=setTimeout(()=>c.abort(),25000);let news;
                try{news=await upstream('https://api.gdeltproject.org/api/v2/doc/doc?'+query,{redirect:'manual',signal:c.signal});}finally{clearTimeout(t);}
                if(!news.ok)return json({error:'ニュース取得元が混雑しています。ニュース評価は未完了です。'},503);
                let body;try{body=await news.json();}catch{return json({error:'ニュース取得元の回数制限または応答エラーです。ニュース評価は未完了です。'},503);}
                const articles=(body.articles||[]).filter(a=>typeof a.url==='string'&&/^https?:\/\//.test(a.url)).slice(0,40).map(a=>({title:String(a.title||'').slice(0,300),url:a.url.slice(0,1500),domain:String(a.domain||'').slice(0,150),seendate:String(a.seendate||'').slice(0,30)}));
                return json({rows:articles,receivedAt:new Date().toISOString(),tokens:0,source:'GDELT'});
              }
              if(research==='quotes'){const symbols=String(researchInput.symbols||'').split(',');if(symbols.length>50||!symbols.every(x=>/^[0-9][0-9A-Z]{3}$/.test(x)))return json({error:'証券コードが不正です。'},400);endpoints.quotes='batch-quote?symbols='+symbols.join(',');}
              endpoint=endpoints[research];if(!endpoint)return json({error:'取得種別が不正です。'},400);
            }
            const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
            let r;try{r=await upstream('https://api.zenithcode.net/stable/'+endpoint,{headers:{'x-api-key':session.apiKey,Accept:'application/json','Accept-Language':'ja'},redirect:'manual',signal:controller.signal});}finally{clearTimeout(timer);}
            if(!r.ok)return json({error:r.status===429?'無料枠の上限または回数制限に達しました。':r.status===401?'APIキーが無効です。接続設定を確認してください。':'取得元でデータを取得できませんでした。',upstreamStatus:r.status},r.status===429?429:502);
            const body=await r.json();
            if(research&&research!=='universe'){const d=body?.data??body;let rows=Array.isArray(d)?d:Array.isArray(d?.observations)?d.observations:[d];const fields={quotes:['symbol','price','priceDate','changePct1w','changePct1m'],indices:['symbol','price','priceDate','changePct1d','changePct1w','changePct1m'],sectors:['sector','sectorJa','priceDate','changePct1wWeighted'],breadth:['sector','date','pctAdvancing'],sentiment:['score','updatedAt'],catalog:['id','seriesId','nameJa','country'],fx:['date','value'],rates:['date','value']}[research];rows=rows.map(row=>Object.fromEntries(fields.map(k=>[k,typeof row?.[k]==='string'?row[k].slice(0,150):typeof row?.[k]==='number'&&Number.isFinite(row[k])?row[k]:null])));return json({rows,receivedAt:new Date().toISOString(),asOf:r.headers.get('X-Data-As-Of'),tokens:['indices','sectors','quotes'].includes(research)?10:1});}
            const rows=Array.isArray(body)?body:Array.isArray(body?.data)?body.data:Array.isArray(body?.historical)?body.historical:body?.data?.historical;
            if(!Array.isArray(rows))return json({error:'取得元の応答形式を確認できませんでした。'},502);
            const fields=url.pathname!=='/api/history'?['symbol','nameJa','nameEn','price','per','pbr','roe','dividendYield','sector','priceDate','changePct1w','changePct1m','marketCap']:['date','close','adjustedClose'];
            const clean=rows.map(row=>Object.fromEntries(fields.map(k=>[k,typeof row[k]==='string'?row[k].slice(0,150):typeof row[k]==='number'&&Number.isFinite(row[k])?row[k]:null])));
            return json({rows:clean,receivedAt:new Date().toISOString(),asOf:r.headers.get('X-Data-As-Of'),tokens:10});
          }catch{return json({error:'データを取得できませんでした。少し待って再試行してください。'},502);}
        }
        if(url.pathname==='/api/session'&&request.method==='GET') {
          const session=await openSession(cookie(request),user,secret);
          return json({connected:Boolean(session),provider:'ZENITH Code',expires:session?.expires||null,serverReady:typeof secret==='string'&&secret.length>=32});
        }
        if(url.pathname==='/api/disconnect'&&request.method==='POST')return json({connected:false},200,{'Set-Cookie':`${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`});
        if(url.pathname==='/api/connect'&&request.method==='POST') {
          let stage='input';
          try {
            const now=Date.now();if(now-(attempts.get(user)||0)<6500)return json({error:'数秒待ってから再試行してください。'},429);
            attempts.set(user,now);if(attempts.size>100)attempts.delete(attempts.keys().next().value);
            if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'入力形式が不正です。'},400);
            if(Number(request.headers.get('Content-Length')||0)>2048)return json({error:'入力が長すぎます。'},400);
            const text=await request.text();if(text.length>2048)return json({error:'入力が長すぎます。'},400);
            const input=JSON.parse(text);const apiKey=String(input.apiKey||'').trim();
            if(!/^[A-Za-z0-9_.-]{16,256}$/.test(apiKey))return json({error:'APIキーの形式を確認してください。'},400);
            stage='encryption';
            await cryptoKey(secret);
            stage='provider';
            const controller=new AbortController();
            const timeout=setTimeout(()=>controller.abort(),20000);
            let response;
            try {response=await upstream('https://api.zenithcode.net/stable/usage',{headers:{'x-api-key':apiKey,'Accept':'application/json','Accept-Language':'ja'},signal:controller.signal,redirect:'manual'});} finally {clearTimeout(timeout);}
            if(!response.ok)return json({error:response.status===401?'APIキーを確認してください。':response.status===429?'無料枠の上限または回数制限に達しています。':'取得元で接続を確認できませんでした。',upstreamStatus:response.status},response.status===429?429:400);
            stage='response';
            const body=await response.json();const usage=body?.data??body;const record=Array.isArray(usage)?usage[0]:usage;
            if(record?.plan!=='free')return json({error:'無料のFreeプランであることを確認できませんでした。ZENITH Codeの設定を確認してください。'},400);
            stage='session';
            const session=await sealSession(apiKey,user,secret);
            return json({connected:true,provider:'ZENITH Code',plan:'free',expires:Date.now()+7200000},200,{'Set-Cookie':`${COOKIE}=${session}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7200`});
          } catch(error) {const messages={input:'入力内容を確認してください。',encryption:'サーバーの暗号化設定に問題があります。APIキーの再発行は不要です。',provider:'取得元への通信に失敗しました。少し待って再試行してください。',response:'取得元からの応答を読み取れませんでした。',session:'接続情報の保存に失敗しました。'};const reason=/Illegal invocation/i.test(error?.message||'')?'INVOCATION':/timeout|abort/i.test(error?.name||'')?'TIMEOUT':'FAILED';return json({error:messages[stage],code:'CONNECT_'+stage.toUpperCase()+'_'+reason},502);}
        }
        return json({error:'Not found'},404);
      }
      if(url.pathname==='/'||url.pathname==='/connect'||url.pathname==='/market') {
        if(!user)return new Response(null,{status:302,headers:{Location:'/signin-with-chatgpt?return_to=%2Fconnect',...baseHeaders}});
        return new Response(assets[url.pathname==='/market'?'market.html':'connect.html'],{headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}});
      }
      const asset=assets[url.pathname.slice(1)];
      if(asset!==undefined&&['/connect.js','/market.js','/engine.js','/scout.js','/scoring.js','/style.css','/icon.svg'].includes(url.pathname))return new Response(asset,{headers:{...baseHeaders,'Content-Type':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'image/svg+xml'}});
      return new Response('Not found',{status:404,headers:baseHeaders});
    },
  };
}
export default createWorker(typeof SCOUT_ASSETS==='undefined'?{}:SCOUT_ASSETS);

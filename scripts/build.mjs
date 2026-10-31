import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const names=['connect.html','connect.js','market.html','market.js','scout.js','scoring.js','sbi.js','engine.js','style.css','icon.svg'];
const assets=Object.fromEntries(await Promise.all(names.map(async name=>[name,await readFile(new URL('dist/'+name,root),'utf8')])));
const server=await readFile(new URL('worker/index.js',root),'utf8');
await mkdir(new URL('dist/server/',root),{recursive:true});await mkdir(new URL('dist/.openai/',root),{recursive:true});
await writeFile(new URL('dist/server/index.js',root),'const SCOUT_ASSETS='+JSON.stringify(assets)+';\n'+server);
await writeFile(new URL('dist/.openai/hosting.json',root),await readFile(new URL('.openai/hosting.json',root)));
console.log('Built private connection Worker');

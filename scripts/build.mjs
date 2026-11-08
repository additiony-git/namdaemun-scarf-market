import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=new URL('../',import.meta.url);
const dist=new URL('dist/',root);
const api=process.env.MARKET_API_URL?.trim()||'';
if(api){
  const url=new URL(api);
  if(url.protocol!=='https:'||url.pathname!=='/api/market'||url.username||url.password||url.search||url.hash)throw Error('MARKET_API_URL must be an https://…/api/market URL');
}
await mkdir(dist,{recursive:true});
const game=new URL('game/',root);
const config='export const MARKET_API = '+JSON.stringify(api)+';\n';
const entries=['app.mjs','catalog.mjs','world.mjs','style.css'];
const sources=await Promise.all(entries.map(file=>readFile(new URL(file,game))));
const hash=createHash('sha256').update(config);
for(const source of sources)hash.update(source);
const version='client-'+hash.digest('hex').slice(0,12);
const assets=new URL(version+'/',dist);
await mkdir(assets,{recursive:true});
await Promise.all([
  ...entries.map((file,i)=>writeFile(new URL(file,assets),sources[i])),
  writeFile(new URL('config.mjs',assets),config),
  ...['mark.svg','vendor.svg','market-intro-warm.webp','market-intro-warm-portrait.webp','market-ambience.wav'].map(file=>cp(new URL(file,game),new URL(file,dist))),
]);
const html=(await readFile(new URL('index.html',game),'utf8'))
  .replace('./app.mjs','./'+version+'/app.mjs')
  .replace('./style.css','./'+version+'/style.css');
await writeFile(new URL('index.html',dist),html);
await writeFile(new URL('.nojekyll',dist),'');
console.log('Built '+fileURLToPath(dist)+(api?' with shared online market':' with solo preview'));

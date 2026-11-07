import { cp, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=new URL('../',import.meta.url);
const dist=new URL('dist/',root);
const api=process.env.MARKET_API_URL?.trim()||'';
if(api){
  const url=new URL(api);
  if(url.protocol!=='https:'||url.pathname!=='/api/market'||url.username||url.password||url.search||url.hash)throw Error('MARKET_API_URL must be an https://…/api/market URL');
}
await mkdir(dist,{recursive:true});
await cp(new URL('game/',root),dist,{recursive:true});
await writeFile(new URL('config.mjs',dist),'export const MARKET_API = '+JSON.stringify(api)+';\n');
await writeFile(new URL('.nojekyll',dist),'');
console.log('Built '+fileURLToPath(dist)+(api?' with shared online market':' with solo preview'));

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, stat, readFile } from 'node:fs/promises';
import { Market, endpoint } from './market.mjs';

const args=process.argv.slice(2);
const option=(name,fallback)=>args.includes(name)?(args[args.indexOf(name)+1]??fallback):fallback;
const port=Number(option('--port',process.env.PORT||8787));
const host=option('--host','127.0.0.1');
const site=resolve(fileURLToPath(new URL('../game/',import.meta.url)));
const dataDir=fileURLToPath(new URL('../.market-data/',import.meta.url));
const inMemory=args.includes('--memory');
if(!inMemory) await mkdir(dataDir,{recursive:true});
const db=new DatabaseSync(inMemory?':memory:':resolve(dataDir,'market.sqlite'));
db.exec('PRAGMA journal_mode = WAL');
const market=new Market((sql,...params)=>{
  const stmt=db.prepare(sql);
  if (/^SELECT\b|\bRETURNING\b/i.test(sql)) return stmt.all(...params);
  stmt.run(...params);return [];
}, fn=>{
  db.exec('BEGIN IMMEDIATE');
  try{const result=fn();db.exec('COMMIT');return result;}
  catch(error){db.exec('ROLLBACK');throw error;}
});
const types={'.html':'text/html','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async (req,res)=>{
  try{
    const origin='http://'+req.headers.host;
    const url=new URL(req.url,origin);
    if(url.pathname==='/api/market'){
      const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:req,duplex:'half'}:{})});
      const reply=await endpoint(market,request,'',req.socket.remoteAddress);
      res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(await reply.text());return;
    }
    if(url.pathname==='/config.mjs'&&['GET','HEAD'].includes(req.method)){
      res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});
      res.end(req.method==='HEAD'?undefined:"export const MARKET_API = './api/market';\n");return;
    }
    const path=resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    if(!path.startsWith(site+sep)||!types[extname(path)]||!(await stat(path).catch(()=>null))?.isFile()){
      res.writeHead(404);res.end('Not found');return;
    }
    const bytes=await readFile(path);
    res.writeHead(200,{'Content-Type':types[extname(path)]+'; charset=utf-8','Cache-Control':'no-cache','Content-Length':bytes.length,'X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){
    if(!res.headersSent)res.writeHead(400);
    res.end('Bad request');
  }
});
server.listen(port,host,()=>console.log('Local: http://'+host+':'+server.address().port+'/'));

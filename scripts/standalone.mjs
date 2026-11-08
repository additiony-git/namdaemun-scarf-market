import { readFile, writeFile } from 'node:fs/promises';
const read = path => readFile(new URL('../game/'+path,import.meta.url),'utf8');
const files=['index.html','style.css','mark.svg','vendor.svg','catalog.mjs','config.mjs','world.mjs','app.mjs'];
const [html,css,mark,vendor,...modules]=await Promise.all(files.map(read));
const mediaFiles={'market-intro-warm.webp':'image/webp','market-intro-warm-portrait.webp':'image/webp','market-ambience.wav':'audio/wav'};
const media=Object.fromEntries(await Promise.all(Object.entries(mediaFiles).map(async ([file,mime])=>{
  const bytes=await readFile(new URL('../game/'+file,import.meta.url));
  return [file,'data:'+mime+';base64,'+bytes.toString('base64')];
})));
const data = svg => 'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');
const code=modules.map(src=>src.replace(/^import [^\n]+\n/gm,'').replace(/^export /gm,'')).join('\n');
const standalone=html.replace(/<link rel="stylesheet"[^>]+>/,'<style>'+css+'</style>')
  .replaceAll('./mark.svg',data(mark)).replaceAll('./vendor.svg',data(vendor))
  .replace(/\.\/(market-intro-warm(?:-portrait)?\.webp|market-ambience\.wav)/g,(_,file)=>media[file])
  .replace('<script type="module" src="./app.mjs"></script>','<script type="module">\n'+code.replace(/<\/script/gi,'<\\/script')+'\n</script>');
await writeFile(new URL('../play.html',import.meta.url),standalone);
console.log('Offline preview: play.html');

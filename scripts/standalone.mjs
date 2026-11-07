import { readFile, writeFile } from 'node:fs/promises';
const read = path => readFile(new URL('../game/'+path,import.meta.url),'utf8');
const files=['index.html','style.css','mark.svg','vendor.svg','catalog.mjs','config.mjs','world.mjs','app.mjs'];
const [html,css,mark,vendor,...modules]=await Promise.all(files.map(read));
const data = svg => 'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');
const code=modules.map(src=>src.replace(/^import [^\n]+\n/gm,'').replace(/^export /gm,'')).join('\n');
const standalone=html.replace(/<link rel="stylesheet"[^>]+>/,'<style>'+css+'</style>')
  .replaceAll('./mark.svg',data(mark)).replaceAll('./vendor.svg',data(vendor))
  .replace('<script type="module" src="./app.mjs"></script>','<script type="module">\n'+code.replace(/<\/script/gi,'<\\/script')+'\n</script>');
await writeFile(new URL('../play.html',import.meta.url),standalone);
console.log('Offline preview: play.html');

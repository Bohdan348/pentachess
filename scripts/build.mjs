import {build} from 'esbuild';
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
await mkdir('build',{recursive:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['src/App.tsx'],bundle:true,outfile:'build/app.js',minify:true,jsx:'automatic',target:'es2022',define:{'process.env.NODE_ENV':'"production"'}});
await build({entryPoints:['src/server.ts'],bundle:true,outfile:'build/server.mjs',platform:'node',format:'esm',packages:'external',target:'node22'});
await build({entryPoints:['src/worker.ts'],bundle:true,outfile:'dist/server/index.js',format:'esm',platform:'browser',target:'es2022',define:{__APP_JS__:JSON.stringify(await readFile('build/app.js','utf8')),__APP_CSS__:JSON.stringify(await readFile('build/app.css','utf8'))}});
await cp('.openai/hosting.json','dist/.openai/hosting.json');await cp('drizzle','dist/drizzle',{recursive:true});
console.log('Built React app, Node WebSocket server and hosted Worker.');

import {build} from 'esbuild';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

await rm('public',{recursive:true,force:true});
await rm('api',{recursive:true,force:true});
await rm('.vercel-tmp',{recursive:true,force:true});
await mkdir('public',{recursive:true});
await mkdir('api',{recursive:true});
await mkdir('.vercel-tmp',{recursive:true});

await build({entryPoints:['src/App.tsx'],bundle:true,outfile:'public/app.js',minify:true,jsx:'automatic',target:'es2022',define:{'process.env.NODE_ENV':'"production"'}});

await build({entryPoints:['src/vercel.ts'],bundle:true,outfile:'api/index.js',platform:'node',format:'esm',target:'node20',define:{'process.env.NODE_ENV':'"production"'}});

await build({entryPoints:['src/shell.ts'],bundle:true,outfile:'.vercel-tmp/shell.mjs',platform:'node',format:'esm',target:'node20'});
const {html}=await import(pathToFileURL(resolve('.vercel-tmp/shell.mjs')).href);
await writeFile('public/index.html',html);

await rm('.vercel-tmp',{recursive:true,force:true});
console.log('Built Vercel static assets (public/) and serverless function (api/index.js).');

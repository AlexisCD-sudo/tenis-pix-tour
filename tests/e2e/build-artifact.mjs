// Genera una sola pàgina HTML (JS + CSS inclosos) del joc, per publicar-la com a artefacte.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const esbuild = require('/opt/npm-tools/node_modules/esbuild');
const outFile = process.argv[2];
const r = await esbuild.build({
  entryPoints: ['src/main.tsx'], bundle: true, write: false, outdir: 'out',
  format: 'iife', jsx: 'automatic', minify: true, target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'css' },
});
let js = '', css = '';
for (const f of r.outputFiles) { if (f.path.endsWith('.js')) js = f.text; else if (f.path.endsWith('.css')) css = f.text; }
js = js.replace(/<\/script/gi, '<\\/script');
const html = `<title>Pixel Tennis Tournament</title>
<style>:root{color-scheme:dark}${css}</style>
<div id="root"></div>
<script>${js}</script>
`;
fs.writeFileSync(outFile, html);
console.log('bytes', html.length);

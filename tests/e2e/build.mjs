// Empaqueta l'app amb esbuild per provar-la en un navegador sense vite.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const esbuild = require('/opt/npm-tools/node_modules/esbuild');
import fs from 'node:fs';
fs.mkdirSync('dist-test', { recursive: true });
await esbuild.build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outfile: 'dist-test/app.js',
  format: 'esm',
  jsx: 'automatic',
  loader: { '.css': 'css', '.woff2': 'dataurl', '.woff': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'info',
});
fs.writeFileSync('dist-test/index.html', `<!doctype html><html lang="ca"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/><title>PTT</title><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script type="module" src="app.js"></script></body></html>`);

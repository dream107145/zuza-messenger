const esbuild = require('esbuild');

const buildOptions = {
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': '"https://rjmkuafxfrsmxzktphjs.supabase.co"',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '"sb_publishable_Lp7Iv0G_sGXAFBAWv0zBWA_tM8TxmEu"',
    'import.meta.env.VITE_GEMINI_API_KEY': '""'
  }
};

Promise.all([
  esbuild.build({
    ...buildOptions,
    entryPoints: ['src/content.ts'],
    outfile: 'public/content.js',
  }),
  esbuild.build({
    ...buildOptions,
    entryPoints: ['src/background.ts'],
    outfile: 'public/background.js',
    format: 'esm', // Background service workers in MV3 often prefer ESM
  })
]).then(() => console.log('Bundle complete!'))
  .catch((err) => {
    console.error('Build failed', err);
    process.exit(1);
  });

const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

async function main() {
  if (watch) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
  } else {
    await esbuild.build(buildOptions);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

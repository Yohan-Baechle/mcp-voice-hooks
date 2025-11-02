import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server/unified-server.ts', 'src/server/hook-merger.ts'],
  format: ['esm'],
  target: 'esnext',
  outDir: 'dist/server',
  clean: true,
  sourcemap: true,
  dts: {
    compilerOptions: {
      allowImportingTsExtensions: true
    }
  },
  external: ['@modelcontextprotocol/sdk']
});
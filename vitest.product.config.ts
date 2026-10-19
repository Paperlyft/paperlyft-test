import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mainRepo = process.env.PAPERLYFT_MAIN_REPO
if (!mainRepo) throw new Error('PAPERLYFT_MAIN_REPO must be set by scripts/test-product-local.ts')
const harnessRoot = path.dirname(fileURLToPath(import.meta.url))

export default {
  root: harnessRoot,
  resolve: {
    alias: {
      '@': mainRepo,
      vitest: path.join(mainRepo, 'node_modules/vitest/dist/index.js'),
      zod: path.join(mainRepo, 'node_modules/zod'),
    },
  },
  test: {
    name: 'product-no-cost',
    environment: 'node',
    setupFiles: [
      path.join(mainRepo, 'tests', 'setup.ts'),
      path.join(harnessRoot, 'tests/product/setup.ts'),
    ],
    include: ['tests/product/**/*.test.ts'],
    maxWorkers: 1,
    testTimeout: 180_000,
    hookTimeout: 30_000,
  },
}

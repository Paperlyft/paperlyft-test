import { vi } from 'vitest'

// Real provider construction is forbidden even if credentials happen to exist on the machine.
// The page runner receives its scripted provider through its normal dependency-injection seam.
vi.mock('@/modules/llm-services', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  createLlmClient() {
    throw new Error('Paid provider construction is disabled in product-local tests')
  },
}))
vi.stubGlobal('fetch', () => {
  throw new Error('External HTTP is disabled in product-local tests')
})

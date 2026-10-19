import { expect, it } from 'vitest'
import { createLlmClient } from '@/modules/llm-services'

it('rejects real provider construction before any model request', () => {
  expect(() => createLlmClient({ provider: 'openai', model: 'gpt-5.6-luna' })).toThrow(
    'Paid provider construction is disabled',
  )
})

it('rejects accidental external HTTP requests', () => {
  expect(() => fetch('https://provider.invalid/')).toThrow('External HTTP is disabled')
})

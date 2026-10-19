import assert from 'node:assert/strict'
import test from 'node:test'
import { requiredAccounts, suiteRequirements, suites } from '../../src/doctor.js'

test('website discovery requires a dedicated account and public fixtures without paid processing', () => {
  assert.ok(suites.includes('discovery'))
  assert.deepEqual(requiredAccounts('discovery'), ['adminA'])
  assert.deepEqual(suiteRequirements('discovery'), {
    mutations: true,
    processing: false,
    publicFixtures: true,
  })
  assert.equal(suiteRequirements('imports').processing, true)
  assert.equal(suiteRequirements('all').processing, true)
  assert.equal(suiteRequirements('smoke').mutations, false)
})

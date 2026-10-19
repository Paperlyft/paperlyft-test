import { expect, test } from '@playwright/test'
import { startLab, type LabHandle } from '../../src/lab/server.js'

let lab: LabHandle
test.beforeAll(async () => {
  lab = await startLab()
})
test.afterAll(async () => {
  await lab?.close()
})

test('client-rendered documents load both API pages and stop at the end', async ({ page }) => {
  await page.goto(`${lab.baseURL}/site-builder`)
  await expect(page.locator('#records a')).toHaveCount(1)
  await expect(page.locator('#records a').first()).toHaveAttribute('href', '/simple-1p.pdf')
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.locator('#records a')).toHaveCount(2)
  await expect(page.locator('#records a').last()).toHaveAttribute('href', '/multi-page-3p.pdf')
  await expect(page.getByRole('button', { name: 'Load more' })).toBeDisabled()
})

test('encoded relative links resolve against the HTML base', async ({ page }) => {
  await page.goto(`${lab.baseURL}/revize/departments/meetings`)
  const link = page.getByRole('link', { name: 'Minutes and agenda' })
  await expect(link).toBeVisible()
  expect(await link.evaluate((element) => (element as HTMLAnchorElement).href)).toBe(
    `${lab.baseURL}/revize/files/Minutes%20%26%20Agenda.pdf`,
  )
})

test('public library redirects work without granting access to restricted files', async ({
  request,
}) => {
  const pdf = await request.get(
    `${lab.baseURL}/sharepoint/sites/council/Shared%20Documents/2026/Agenda.pdf`,
  )
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toBe('application/pdf')
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
  expect((await request.get(`${lab.baseURL}/sharepoint/login`)).status()).toBe(401)
  expect((await request.get(`${lab.baseURL}/sharepoint/token-expired`)).status()).toBe(403)
})

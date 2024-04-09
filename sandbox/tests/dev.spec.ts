import { test, expect } from '@playwright/test'
import { goHome } from './util'

test('check serialization', async ({ page }) => {
	await goHome(page)
	await page.getByRole('button', { name: 'Test Serialization' }).click()
	await expect(page.locator('#serializationPassedResult')).toHaveText('Passed!')
})

import { test, expect } from '@playwright/test'
import { goHome } from './util'

test('check memory state', async ({ page }) => {
	await goHome(page)
	await page.getByRole('button', { name: 'Calculate Memory State' }).click()
	await expect
		.poll(
			async () => {
				let memoryStateText = await page
					.locator('#memoryStateResponse')
					.innerText()
				return memoryStateText.split(',').map((x) => Math.round(parseFloat(x)))
			},
			{
				intervals: [200],
			},
		)
		.toEqual([19, 3, 457])
})

test('check next interval', async ({ page }) => {
	await goHome(page)
	await page.getByRole('button', { name: 'Calculate Next Interval' }).click()
	await expect(page.locator('#nextIntervalResponse')).toContainText('.') // ensures that text has updated, so the more specific assertion can run
	const nextInterval = await page.locator('#nextIntervalResponse').textContent()
	// FSRS-7 schedules this card in under a day, so rounding to whole days would hide regressions.
	expect(parseFloat(nextInterval)).toBeCloseTo(0.1956, 3)
})

test('check extended api', async ({ page }) => {
	await goHome(page)
	await page.getByRole('button', { name: 'Check Extended API' }).click()
	await expect(page.locator('#extendedApiPassedResult')).toHaveText('Passed!')
})

test('selects FSRS-6 for calculations and example training', async ({
	page,
}) => {
	await goHome(page)
	const version = page.getByRole('combobox', { name: 'FSRS version' })
	await expect(version).toHaveValue('7')
	await version.selectOption({ label: 'FSRS-6' })
	await page.getByRole('button', { name: 'Calculate Memory State' }).click()
	const state = page.locator('#memoryStateResponse')
	await expect
		.poll(async () =>
			(await state.innerText()).split(',').map((x) => Math.round(Number(x))),
		)
		.toEqual([36, 2, 36])
	await page.getByRole('button', { name: 'Calculate Next Interval' }).click()
	await expect(page.locator('#nextIntervalResponse')).toHaveText('1.5')
	await page.getByRole('button', { name: 'Train with example file' }).click()
	const parameters = page.locator('#parametersResult')
	await expect
		.poll(async () => (await parameters.innerText()).split(',').length, {
			timeout: 20_000,
		})
		.toBe(21)
	await version.selectOption({ label: 'FSRS-7' })
	await expect(state).toBeEmpty()
	await expect(parameters).toBeEmpty()
	await page.getByRole('button', { name: 'Calculate Next Interval' }).click()
	await expect(page.locator('#nextIntervalResponse')).toHaveText(/^0\.1955/)
})

test('check progress and parameters', async ({ page }) => {
	await goHome(page)
	const progress = await page.locator('#progressNumbers').innerText()
	expect(progress).toEqual('0/0')
	await page.getByRole('button', { name: 'Train with example file' }).click()
	await expect
		.poll(
			async () => {
				let progress = await page.locator('#progressNumbers').innerText()
				let [n, d] = progress.split('/').map((x) => Math.round(parseInt(x)))
				return {
					numeratorLargerThan0: n > 0,
					numeratorNoMoreThanDenominator: n <= d,
					denominatorIsLarge: d > 100,
				}
			},
			{
				message: 'Progress goes up',
				timeout: 20_000,
				intervals: [200],
			},
		)
		.toEqual({
			numeratorLargerThan0: true,
			numeratorNoMoreThanDenominator: true,
			denominatorIsLarge: true,
		})
	await expect
		.poll(
			async () => {
				let parameters = await page.locator('#parametersResult').innerText()
				return parameters.split(',').length
			},
			{
				timeout: 20_000,
				intervals: [200],
			},
		)
		.toEqual(34)
})

test('reads final training counts before the first polling tick', async ({
	page,
}) => {
	await goHome(page)
	await page.clock.install({ time: 0 })
	await page.clock.pauseAt(1_000)
	await page
		.getByRole('button', { name: 'Train with example file' })
		.dispatchEvent('click')
	await expect(page.locator('#parametersResult')).not.toBeEmpty({
		timeout: 20_000,
	})
	const counts = await page.locator('#progressNumbers').innerText()
	const [processed, total] = counts.split('/').map(Number)
	expect(processed).toBeGreaterThan(0)
	expect(processed).toBeLessThanOrEqual(total)
	expect(total).toBeGreaterThan(100)
})

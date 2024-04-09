import { Page } from '@playwright/test'

export async function goHome(page: Page) {
	await page.goto('http://localhost:3000')
}

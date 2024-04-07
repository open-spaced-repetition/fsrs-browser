import { Page } from '@playwright/test'

export async function goHome(page: Page) {
	await page.goto('http://127.0.0.1:3000')
}

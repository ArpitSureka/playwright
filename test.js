import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  // Navigate to the Wikipedia homepage
  try {
    await page.goto('https://www.wikipedia.org/', { waitUntil: 'networkidle2' });
  } catch (error) {
    console.error('Failed to navigate to Wikipedia:', error);
    throw error;
  }
  try {
    // Capture a screenshot of the entire page
    await page.screenshot({ path: 'screenshot-html-2025-04-06T08-30-44-573Z.png', fullPage: true });
  } catch (error) {
    console.error('Failed to take screenshot:', error);
  }
});
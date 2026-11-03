import { test, expect } from '@playwright/test';
test('backend foundation connection status', async ({page}) => {
  test.skip(process.env.LINKLENS_API_TESTS !== '1', 'Run with LINKLENS_API_TESTS=1 and the API running.');
  await page.goto('/status');
  await expect(page.getByRole('heading', {name:'Backend connection'})).toBeVisible();
  await page.getByRole('button', {name:'Check API connection'}).click();
  await expect(page.getByText(/API connected · (foundation|storage|structural-analysis)/)).toBeVisible();
  await expect(page.getByText('Not implemented', {exact:true})).toHaveCount(3);
});

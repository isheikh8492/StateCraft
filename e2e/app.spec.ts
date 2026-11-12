import { expect, test } from '@playwright/test';

/**
 * End-to-end: the real UI against the real server and a real campaign file.
 * Each test covers one thing a player can do.
 */

const composer = 'New policy box';

test('the app opens and reaches the server', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'StateCraft', level: 1 })).toBeVisible();
  await expect(page.getByText('Connected')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Policy desk' })).toBeVisible();
  await expect(page.getByText('No policy boxes yet')).toBeVisible();
});

test('a policy box goes from the screen to the campaign file and back', async ({ page }) => {
  await page.goto('/');
  const boxes = page.getByRole('list', { name: 'Policy boxes' }).getByRole('listitem');

  await page.getByLabel(composer).fill('Cut the fuel subsidy by a fifth');
  await page.getByRole('button', { name: 'Add policy box' }).click();
  await expect(boxes).toHaveCount(1);
  await expect(boxes.first()).toContainText('Cut the fuel subsidy by a fifth');
  await expect(page.getByLabel(composer)).toHaveValue('');

  // Enter adds a box; Shift+Enter makes a new line inside one.
  await page.getByLabel(composer).fill('Open talks with the port union');
  await page.getByLabel(composer).press('Shift+Enter');
  await page.getByLabel(composer).pressSequentially('before the strike deadline');
  await page.getByLabel(composer).press('Enter');
  await expect(boxes).toHaveCount(2);
  await expect(boxes.nth(1)).toContainText('before the strike deadline');

  // The server recorded both: they survive a reload, and the event count shows them.
  await page.reload();
  await expect(boxes).toHaveCount(2);
  await expect(page.getByText('2 events')).toBeVisible();

  // Deleting is a new event, not an erasure.
  await boxes.first().getByRole('button', { name: 'Delete policy box' }).click();
  await expect(boxes).toHaveCount(1);
  await page.reload();
  await expect(boxes).toHaveCount(1);
  await expect(boxes.first()).toContainText('Open talks with the port union');
  await expect(page.getByText('3 events')).toBeVisible();
});

test('an empty box cannot be added', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add policy box' })).toBeDisabled();
  await page.getByLabel(composer).fill('   ');
  await expect(page.getByRole('button', { name: 'Add policy box' })).toBeDisabled();
});

test('windows can be minimised and reopened', async ({ page }) => {
  await page.goto('/');
  const desk = page.getByRole('region', { name: 'Policy desk' });
  await page.getByRole('button', { name: 'Minimise Policy desk' }).click();
  await expect(desk).toBeHidden();
  await page
    .getByRole('navigation', { name: 'Windows' })
    .getByRole('button', { name: 'Policy desk' })
    .click();
  await expect(desk).toBeVisible();
});

test('the component gallery opens', async ({ page }) => {
  await page.goto('/#gallery');
  await expect(page.getByRole('heading', { name: 'Component gallery' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the game' }).click();
  await expect(page.getByRole('region', { name: 'Policy desk' })).toBeVisible();
});

test('the API refuses callers without the session token or from another site', async ({
  request,
}) => {
  const noToken = await request.get('/api/cards');
  expect(noToken.status()).toBe(401);

  const wrongToken = await request.post('/api/cards', {
    headers: { 'x-statecraft-token': 'not-the-token' },
    data: { text: 'Injected by another program' },
  });
  expect(wrongToken.status()).toBe(401);

  const { token } = (await (await request.get('/api/session')).json()) as { token: string };
  const otherSite = await request.get('/api/cards', {
    headers: { 'x-statecraft-token': token, Origin: 'https://example.com' },
  });
  expect(otherSite.status()).toBe(403);

  const crossSiteHandshake = await request.get('/api/session', {
    headers: { 'Sec-Fetch-Site': 'cross-site' },
  });
  expect(crossSiteHandshake.status()).toBe(403);

  const ok = await request.get('/api/cards', { headers: { 'x-statecraft-token': token } });
  expect(ok.status()).toBe(200);
});

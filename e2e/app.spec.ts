import { expect, type Page, test } from '@playwright/test';

/**
 * End-to-end: the real UI against the real server, engine and campaign file. The model is
 * the scripted stand-in, reached over HTTP through the real adapter. The tests share one
 * campaign and run in order, like one sitting of play.
 */

const composer = 'New policy box';
const boxes = (page: Page) =>
  page.getByRole('list', { name: 'Policy boxes' }).getByRole('listitem');
const win = (page: Page, name: string) => page.getByRole('region', { name });
const openWindow = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Windows' }).getByRole('button', { name }).click();
const date = (page: Page) => page.getByTestId('game-date');
const addBox = async (page: Page, text: string) => {
  await page.getByLabel(composer).fill(text);
  await page.getByRole('button', { name: 'Add policy box' }).click();
};

test('a campaign starts: you take office and the map shows the country', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'StateCraft', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose where to begin' })).toBeVisible();
  await page.getByRole('button', { name: 'Take office' }).click();

  await expect(win(page, 'Policy desk')).toBeVisible();
  await expect(page.getByText('Connected')).toBeVisible();
  await expect(date(page)).toHaveText('1 November 2026');
  await expect(page.locator('[data-region="balochistan"]')).toHaveAttribute(
    'data-status',
    'contested',
  );
  await expect(page.locator('[data-region="punjab"]')).toHaveAttribute('data-stage', 'calm');
  await expect(win(page, 'Briefing').getByText('Inflation')).toBeVisible();
});

test('a policy box keeps your words, survives a reload, and can be edited, moved and deleted', async ({
  page,
}) => {
  await page.goto('/');
  await addBox(page, 'Cut the fuel subsidy sharply');
  await expect(boxes(page)).toHaveCount(1);
  await expect(page.getByLabel(composer)).toHaveValue('');
  await expect(boxes(page).first()).toContainText('Cut the fuel subsidy sharply');

  // Enter adds a box; Shift+Enter makes a new line inside one.
  await page.getByLabel(composer).fill('Open talks with the port union');
  await page.getByLabel(composer).press('Shift+Enter');
  await page.getByLabel(composer).pressSequentially('before the strike deadline');
  await page.getByLabel(composer).press('Enter');
  await expect(boxes(page)).toHaveCount(2);

  await page.reload();
  await expect(boxes(page)).toHaveCount(2);

  // Boxes can be reordered and edited in place.
  await boxes(page).nth(1).getByRole('button', { name: 'Move policy box up' }).click();
  await expect(boxes(page).first()).toContainText('port union');
  await boxes(page).first().getByRole('button', { name: 'Edit policy box' }).click();
  await page.getByRole('textbox', { name: 'Edit policy box' }).fill('Raise the sales tax slightly');
  await boxes(page).first().getByRole('button', { name: 'Save' }).click();
  await boxes(page).first().getByRole('button', { name: 'Move policy box down' }).click();
  await expect(boxes(page).nth(1)).toContainText('Raise the sales tax slightly');

  await boxes(page).nth(1).getByRole('button', { name: 'Delete policy box' }).click();
  await expect(boxes(page)).toHaveCount(1);
  await page.reload();
  await expect(boxes(page)).toHaveCount(1);

  await expect(page.getByRole('button', { name: 'Add policy box' })).toBeDisabled();
  await page.getByLabel(composer).fill('   ');
  await expect(page.getByRole('button', { name: 'Add policy box' })).toBeDisabled();
});

test('executing turns boxes into policies, moves the clock and writes the chronicle', async ({
  page,
}) => {
  await page.goto('/');
  await addBox(page, 'Order the State Bank to lower the interest rate');
  await expect(boxes(page)).toHaveCount(2);
  await page.getByRole('button', { name: /^Execute 2 boxes/ }).click();

  // Results arrive without a reload: the boxes are consumed and time has moved.
  await expect(page.getByText('No policy boxes yet')).toBeVisible();
  await expect(date(page)).not.toHaveText('1 November 2026');
  const chronicle = page.getByRole('list', { name: 'Chronicle' });
  await expect(chronicle.getByRole('listitem').first()).toBeVisible();
  await expect(chronicle).toContainText('Cut fuel or power subsidies');
  await expect(chronicle.getByText('Simulated').first()).toBeVisible();

  // The chronicle links to the policy page, which is built from the record.
  await chronicle.getByRole('button', { name: 'Cut fuel or power subsidies' }).first().click();
  const page1 = win(page, 'Policies').getByRole('article');
  await expect(page1.getByText('Cut the fuel subsidy sharply')).toBeVisible();
  await expect(page1.getByText(/Saves .*% of GDP a year/)).toBeVisible();
  await expect(page1.getByRole('cell', { name: 'Subsidies spending' })).toBeVisible();
  await expect(page1.getByRole('list', { name: 'Stage' })).toBeVisible();

  // An order outside the office's powers comes back with the reason.
  await page1.getByRole('button', { name: 'All policies' }).click();
  await win(page, 'Policies')
    .getByRole('button', { name: /Change the central bank rate/ })
    .click();
  await expect(win(page, 'Policies').getByRole('alert')).toContainText(
    'State Bank of Pakistan sets the policy rate independently',
  );
});

test('conflicting boxes are held until you choose', async ({ page }) => {
  await page.goto('/');
  await addBox(page, 'Build new roads and dams across the country');
  await addBox(page, 'Freeze and cut the development budget');
  await expect(boxes(page)).toHaveCount(2);
  const before = await date(page).textContent();
  await page.getByRole('button', { name: /^Execute 2 boxes/ }).click();
  await expect(page.getByText('Some boxes pull against each other')).toBeVisible();
  await expect(date(page)).toHaveText(before ?? '');
  await expect(boxes(page)).toHaveCount(2);

  await boxes(page).nth(1).getByRole('button', { name: 'Delete policy box' }).click();
  await page.getByRole('button', { name: /^Execute 1 box/ }).click();
  await expect(page.getByText('No policy boxes yet')).toBeVisible();
  await expect(date(page)).not.toHaveText(before ?? '');
});

test('time advances, the chronicle places events on the map, and the inspector shows the cost', async ({
  page,
}) => {
  await page.goto('/');
  const before = await date(page).textContent();
  await page.getByLabel('How far to run the clock').selectOption('30');
  await page.getByRole('button', { name: 'Advance' }).click();
  await expect(date(page)).not.toHaveText(before ?? '');

  // The same button runs a single day.
  const dayBefore = await date(page).textContent();
  await page.getByLabel('How far to run the clock').selectOption('1');
  await page.getByRole('button', { name: 'Advance' }).click();
  await expect(date(page)).not.toHaveText(dayBefore ?? '');

  // Or straight to a chosen date.
  await page.getByLabel('How far to run the clock').selectOption('0');
  await page.getByLabel('Run to this date').fill('2027-03-01');
  await page.getByRole('button', { name: 'Advance' }).click();
  await expect(date(page)).toHaveText('1 March 2027');
  await expect(page.getByRole('list', { name: 'Chronicle' })).toContainText(
    'Official figures were published',
  );

  await win(page, 'Briefing')
    .getByRole('button', { name: /Balochistan/ })
    .click();
  await expect(page.locator('[data-region="balochistan"]')).toHaveAttribute('aria-pressed', 'true');

  await openWindow(page, 'Inspector');
  const inspector = win(page, 'Inspector');
  await expect(inspector.getByText('Model calls')).toBeVisible();
  await expect(
    inspector.getByRole('list', { name: 'Model calls' }).getByText('turn.adjudicate v1'),
  ).toBeVisible();
  await expect(
    inspector
      .getByRole('list', { name: 'Model calls' })
      .getByText('model', { exact: true })
      .first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Minimise Inspector' }).click();
  await expect(inspector).toBeHidden();
});

test('the model can be checked before you rely on it', async ({ page }) => {
  await page.goto('/');
  await openWindow(page, 'Model');
  const panel = win(page, 'Model');
  await expect(panel.getByLabel('Model name, exactly as the server lists it')).toHaveValue(
    'standin',
  );
  await panel.getByRole('button', { name: 'Check this model' }).click();
  await expect(panel.getByRole('region', { name: 'Model check result' })).toContainText('suitable');
  // A role can be given its own model; by default it uses the main one.
  await panel.getByRole('tab', { name: 'Narrator' }).click();
  await expect(panel.getByLabel('Use the main model for this role')).toBeChecked();
  await page.getByRole('button', { name: 'Minimise Model' }).click();
});

test('rewinding goes back to an earlier day on a new line of history', async ({ page }) => {
  await page.goto('/');
  await openWindow(page, 'Timeline');
  const timeline = win(page, 'Timeline');
  // First to a date in the middle of a resolution: the game replays up to that day.
  await timeline.getByLabel('Or go back to any date').fill('2027-01-15');
  await timeline.getByRole('button', { name: 'Go back to this date' }).click();
  await expect(date(page)).toHaveText('15 January 2027');
  await expect(page.getByText('Line 2')).toBeVisible();

  const start = timeline
    .getByRole('list', { name: 'Saved points' })
    .getByRole('listitem')
    .filter({ hasText: 'Campaign start' });
  await start.getByRole('button', { name: 'Rewind' }).click();
  await start.getByRole('button', { name: 'Go back to here' }).click();

  await expect(date(page)).toHaveText('1 November 2026');
  await expect(page.getByText('Line 3')).toBeVisible();
  await expect(page.getByText('Nothing has happened yet')).toBeVisible();
  await expect(timeline.getByText('Lines of history')).toBeVisible();
  await page.reload();
  await expect(date(page)).toHaveText('1 November 2026');
  await expect(page.getByText('Line 3')).toBeVisible();
});

test('windows can be minimised and reopened, and the gallery opens', async ({ page }) => {
  await page.goto('/');
  const desk = win(page, 'Policy desk');
  await page.getByRole('button', { name: 'Minimise Policy desk' }).click();
  await expect(desk).toBeHidden();
  await openWindow(page, 'Policy desk');
  await expect(desk).toBeVisible();

  await page.goto('/#gallery');
  await expect(page.getByRole('heading', { name: 'Component gallery' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the game' }).click();
  await expect(win(page, 'Policy desk')).toBeVisible();
});

test('the API refuses callers without the session token or from another site', async ({
  request,
}) => {
  expect((await request.get('/api/view')).status()).toBe(401);
  const wrongToken = await request.post('/api/cards', {
    headers: { 'x-statecraft-token': 'not-the-token' },
    data: { text: 'Injected by another program' },
  });
  expect(wrongToken.status()).toBe(401);

  const { token } = (await (await request.get('/api/session')).json()) as { token: string };
  const otherSite = await request.get('/api/view', {
    headers: { 'x-statecraft-token': token, Origin: 'https://example.com' },
  });
  expect(otherSite.status()).toBe(403);
  const crossSiteHandshake = await request.get('/api/session', {
    headers: { 'Sec-Fetch-Site': 'cross-site' },
  });
  expect(crossSiteHandshake.status()).toBe(403);
  expect(
    (await request.get('/api/view', { headers: { 'x-statecraft-token': token } })).status(),
  ).toBe(200);
});

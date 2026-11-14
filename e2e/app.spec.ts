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
/** Opens the time panel and picks one of its options. Any boxes on the desk go out first. */
const move = async (page: Page, option: string | RegExp) => {
  await page.getByRole('button', { name: 'Move time forward' }).click();
  await page
    .getByRole('region', { name: 'Move time forward' })
    .getByRole('button', { name: option })
    .click();
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

test('a policy box keeps your words, survives a reload, and can be edited and removed', async ({
  page,
}) => {
  await page.goto('/');
  await addBox(page, 'Cut the fuel subsidy sharply');
  await expect(boxes(page)).toHaveCount(1);
  await expect(page.getByLabel(composer)).toHaveValue('');
  // A box is only your words: nobody comments on it before it is sent.
  await expect(boxes(page).first().getByTestId('advice')).toHaveCount(0);

  // Enter adds a box; Shift+Enter makes a new line inside one.
  await page.getByLabel(composer).fill('Open talks with the port union');
  await page.getByLabel(composer).press('Shift+Enter');
  await page.getByLabel(composer).pressSequentially('before the strike deadline');
  await page.getByLabel(composer).press('Enter');
  await expect(boxes(page)).toHaveCount(2);
  await page.reload();
  await expect(boxes(page)).toHaveCount(2);

  // The plan is numbered; clicking a box's words edits them in place, and Enter saves.
  await expect(page.getByText("This turn's plan · 2")).toBeVisible();
  await boxes(page).nth(1).getByRole('button', { name: 'Edit policy box' }).click();
  await page.getByRole('textbox', { name: 'Edit policy box' }).fill('Raise the sales tax slightly');
  await page.getByRole('textbox', { name: 'Edit policy box' }).press('Enter');
  await expect(boxes(page).nth(1)).toContainText('Raise the sales tax slightly');

  await boxes(page).nth(1).getByRole('button', { name: 'Delete policy box' }).click();
  await expect(boxes(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Add policy box' })).toBeDisabled();
});

test('moving time sends your orders; the world answers, and each order has a page', async ({
  page,
}) => {
  await page.goto('/');
  await addBox(page, 'Order the State Bank to lower the interest rate');
  await expect(boxes(page)).toHaveCount(2);
  await move(page, /1 month later/);

  // The turn lands without a reload: the desk is clear and the date has moved.
  await expect(boxes(page)).toHaveCount(0);
  await expect(date(page)).toHaveText('1 December 2026');

  // What happened, one card to an event, opening on the latest page. The first page holds
  // the orders themselves and the first answers to them.
  const chronicle = win(page, 'Chronicle');
  await expect(chronicle.getByRole('navigation', { name: 'Chronicle pages' })).toBeVisible();
  await expect(chronicle.getByText('simulated by the game')).toBeVisible();
  const earlier = chronicle.getByRole('button', { name: 'Earlier page' });
  while (await earlier.isEnabled()) await earlier.click();
  await expect(chronicle.getByText(/ordered: Cut fuel or power subsidies/)).toBeVisible();
  // Someone answers every order, in their own voice.
  await expect(chronicle.getByTestId('quote').first()).toBeVisible();

  // Looking back shows the world as it was; nothing can be ordered from the past.
  await chronicle.getByRole('button', { name: 'See the world at this point' }).first().click();
  await expect(win(page, 'Policy desk').getByText('You are looking at the past')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move time forward' })).toBeDisabled();
  await win(page, 'Policy desk').getByRole('button', { name: 'Return to the present' }).click();
  await expect(win(page, 'Policy desk').getByText('You are looking at the past')).toBeHidden();

  // The chronicle can be taken away as a file.
  const download = page.waitForEvent('download');
  await chronicle.getByRole('button', { name: 'Export' }).click();
  expect((await download).suggestedFilename()).toMatch(/^statecraft-chronicle-.*\.md$/);

  // Those the order cuts against write to you unasked.
  await expect(
    page.getByRole('navigation', { name: 'Windows' }).getByRole('button', { name: /People/ }),
  ).toContainText(/[1-9]/);

  // An order's page is built from the record: your words, the cost, and who reacted.
  await openWindow(page, 'Policies');
  await win(page, 'Policies')
    .getByRole('button', { name: /Cut fuel or power subsidies/ })
    .first()
    .click();
  const policy = win(page, 'Policies').getByRole('article');
  await expect(policy.getByText('Cut the fuel subsidy sharply')).toBeVisible();
  await expect(policy.getByText(/Saves .*% of GDP a year/)).toBeVisible();
  await expect(policy.getByRole('cell', { name: 'Subsidies spending' })).toBeVisible();
  await expect(policy.getByRole('heading', { name: 'Reactions' })).toBeVisible();
  await expect(policy.getByText('The Pakistan Peoples Party').first()).toBeVisible();

  // An order outside the office's powers comes back with the reason.
  await policy.getByRole('button', { name: 'All policies' }).click();
  await win(page, 'Policies')
    .getByRole('button', { name: /Change the central bank rate/ })
    .click();
  await expect(win(page, 'Policies').getByRole('alert')).toContainText(
    'State Bank of Pakistan sets the policy rate independently',
  );
  await page.getByRole('button', { name: 'Minimise Policies' }).click();
});

test('conflicting boxes are held until you choose', async ({ page }) => {
  await page.goto('/');
  await addBox(page, 'Build new roads and dams across the country');
  await addBox(page, 'Freeze and cut the development budget');
  await expect(boxes(page)).toHaveCount(2);
  await move(page, /1 week later/);
  await expect(page.getByText('Some boxes pull against each other')).toBeVisible();
  await expect(date(page)).toHaveText('1 December 2026');
  await expect(boxes(page)).toHaveCount(2);

  await boxes(page).nth(1).getByRole('button', { name: 'Delete policy box' }).click();
  await move(page, /1 week later/);
  await expect(boxes(page)).toHaveCount(0);
  await expect(date(page)).toHaveText('8 December 2026');
});

test('the clock moves by an hour, by months or to a date, and an entry can be read in full', async ({
  page,
}) => {
  await page.goto('/');
  // The play button on the desk sends what is there and runs to the next thing that needs
  // you: here an hour on, when the first answer comes in, without the date changing.
  await expect(page.getByTestId('game-hour')).toHaveText('09:00');
  await addBox(page, 'Increase development spending on roads.');
  await page.getByRole('button', { name: 'Send 1 box and run to the next thing' }).click();
  await expect(page.getByTestId('game-hour')).toHaveText('10:00');
  await expect(date(page)).toHaveText('8 December 2026');
  // With the plan sent, the button at the end of the line is play again.
  await expect(page.getByRole('button', { name: 'Run to the next thing' })).toBeVisible();

  await move(page, /3 months later/);
  await expect(date(page)).toHaveText('9 March 2027');
  await page.getByRole('button', { name: 'Move time forward' }).click();
  await page.getByLabel('Jump to a specific date').fill('2027-03-20');
  await page.getByRole('button', { name: 'Go to that date' }).click();
  await expect(date(page)).toHaveText('20 March 2027');

  // Depth is written only when asked for, then kept.
  const chronicle = win(page, 'Chronicle');
  await chronicle.getByRole('button', { name: 'Read the full account' }).first().click();
  await expect(chronicle.getByTestId('full-account').first()).toBeVisible();
  await page.reload();
  await expect(win(page, 'Chronicle').getByTestId('full-account').first()).toBeVisible();

  await win(page, 'Briefing')
    .getByRole('button', { name: /Balochistan/ })
    .click();
  await expect(page.locator('[data-region="balochistan"]')).toHaveAttribute('aria-pressed', 'true');

  await openWindow(page, 'Inspector');
  const inspector = win(page, 'Inspector');
  await expect(inspector.getByText('Model calls')).toBeVisible();
  const judging = inspector
    .getByRole('list', { name: 'Model calls' })
    .getByRole('listitem')
    .filter({ hasText: 'turn.adjudicate v' });
  await expect(judging).toBeVisible();
  // Every call carries its own measurements and says how the shape was asked for.
  await expect(judging).toContainText('to first token');
  await expect(judging).toContainText('tok/s');
  await expect(judging).toContainText('schema');
  await expect(inspector.getByText('Held to the schema')).toBeVisible();
  await page.getByRole('button', { name: 'Minimise Inspector' }).click();
});

test('people can be asked, and some cannot be reached', async ({ page }) => {
  await page.goto('/');
  await openWindow(page, 'People');
  const people = win(page, 'People');
  await people.getByRole('button', { name: 'The Finance Minister' }).click();
  await people.getByLabel('Your question').fill('What has the subsidy cut done so far?');
  await people.getByRole('button', { name: 'Ask' }).click();
  const thread = people.getByRole('list', { name: 'Conversation' });
  await expect(thread).toContainText('What has the subsidy cut done so far?');
  await expect(thread.locator('blockquote')).toContainText('on the record');

  // Something put on the table is remembered, and you are held to it.
  await people.getByRole('button', { name: /The Pakistan Peoples Party/ }).click();
  await expect(thread).toContainText('They wrote to you');
  await people
    .getByLabel('Your question')
    .fill('In return for your votes I will expand cash transfers in Sindh.');
  await people.getByRole('button', { name: 'Ask' }).click();
  await expect(people.getByRole('list', { name: 'What you have undertaken' })).toContainText(
    'You said:',
  );
  await expect(people.getByRole('list', { name: 'What you have undertaken' })).toContainText(
    'due by',
  );

  await people.getByRole('button', { name: 'The Baloch Liberation Army' }).click();
  await expect(people.getByText('There is no channel to them')).toBeVisible();
  await expect(people.getByLabel('Your question')).toBeHidden();
  await page.getByRole('button', { name: 'Minimise People' }).click();
});

test('the model can be checked before you rely on it', async ({ page }) => {
  await page.goto('/');
  await openWindow(page, 'Model');
  const panel = win(page, 'Model');
  await expect(panel.getByLabel('Model name, exactly as the server lists it')).toHaveValue(
    'standin',
  );
  await panel.getByRole('button', { name: 'Check this model' }).click();
  const result = panel.getByRole('region', { name: 'Model check result' });
  await expect(result).toContainText('suitable');
  // The check says whether the server held the replies to the schema or we fell back to
  // asking for the shape in the prompt, and how fast the model answered.
  await expect(result).toContainText('schema enforced');
  await expect(result).toContainText('to first token');
  await expect(panel.getByLabel('How much the game writes')).toHaveValue('standard');
  await panel.getByRole('tab', { name: 'Narrator' }).click();
  await expect(panel.getByLabel('Use the main model for this role')).toBeChecked();
  await page.getByRole('button', { name: 'Minimise Model' }).click();
});

test('rewinding goes back to an earlier day on a new line of history', async ({ page }) => {
  await page.goto('/');
  await openWindow(page, 'Rewind');
  const rewind = win(page, 'Rewind');
  // First to a date in the middle of a turn: the game replays up to that day.
  await rewind.getByLabel('Or go back to any date').fill('2027-01-15');
  await rewind.getByRole('button', { name: 'Go back to this date' }).click();
  await expect(date(page)).toHaveText('15 January 2027');
  await expect(page.getByText('Line 2')).toBeVisible();

  const start = rewind
    .getByRole('list', { name: 'Saved points' })
    .getByRole('listitem')
    .filter({ hasText: 'Campaign start' });
  await start.getByRole('button', { name: 'Rewind' }).click();
  await start.getByRole('button', { name: 'Go back to here' }).click();
  await expect(date(page)).toHaveText('1 November 2026');
  await expect(page.getByText('Line 3')).toBeVisible();
  await expect(page.getByText('Nothing has happened yet')).toBeVisible();
  await page.reload();
  await expect(date(page)).toHaveText('1 November 2026');

  // From a clean start, play runs the clock to whatever happens next. It moves by the hour
  // and at most to the next morning, so it is still early November.
  await page.getByRole('button', { name: 'Run to the next thing' }).click();
  await expect(date(page)).toHaveText(/^[12] November 2026$/);
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

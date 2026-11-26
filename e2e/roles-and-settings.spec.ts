import { expect, test, type Page } from '@playwright/test';

type Bootstrap = {
  tenant: { id: string };
  venues: Array<{ id: string }>;
  staff: Array<{ id: string; name: string; role: string }>;
};

async function loginAs(page: Page, role: string, pin = '1234') {
  const bootstrap = (await (
    await page.request.get('/api/bootstrap')
  ).json()) as Bootstrap;
  const member = bootstrap.staff.find((entry) => entry.role === role);
  expect(member, `missing seeded ${role} user`).toBeTruthy();
  const response = await page.request.post('/api/auth/pin', {
    data: {
      tenant_id: bootstrap.tenant.id,
      user_id: member!.id,
      pin,
    },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  return { bootstrap, member: member! };
}

async function navButtons(page: Page) {
  return page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button')
    .allTextContents();
}

test('owner can add, edit and remove staff from the Staff page', async ({
  page,
}) => {
  await loginAs(page, 'owner');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Staff' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Staff', level: 1 }),
  ).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill('E2E Kitchen');
  await page.getByLabel('PIN', { exact: true }).fill('6789');
  await page.getByRole('combobox', { name: 'Role' }).selectOption('kitchen');
  await page.getByRole('button', { name: 'Add staff' }).click();

  const rows = page.locator('.staff-admin > div');
  const row = rows.filter({ hasText: 'E2E Kitchen' });
  await expect(row).toContainText('Kitchen');
  const index = await row.evaluate((element) =>
    Array.from(element.parentElement!.children).indexOf(element),
  );
  await row.getByRole('button', { name: 'Edit' }).click();
  const editRow = rows.nth(index);
  await editRow.locator('select').selectOption('housekeeping');
  await editRow.getByRole('button', { name: 'Save' }).click();
  await expect(row).toContainText('Housekeeping');

  await row.getByRole('button', { name: 'Remove' }).click();
  await expect(rows.filter({ hasText: 'E2E Kitchen' })).toHaveCount(0);
});

test('role navigation follows kitchen, housekeeping and manager access', async ({
  page,
}) => {
  await loginAs(page, 'kitchen');
  expect(await navButtons(page)).toEqual(['KDS', 'Shifts']);

  await loginAs(page, 'housekeeping');
  expect(await navButtons(page)).toEqual(['Shifts']);

  await loginAs(page, 'manager');
  const managerNav = await navButtons(page);
  expect(managerNav).toContain('Staff');
  expect(managerNav).toContain('Stock');
  expect(managerNav).not.toContain('Settings');

  await loginAs(page, 'owner');
  const ownerNav = await navButtons(page);
  expect(ownerNav).toContain('Staff');
  expect(ownerNav).toContain('Settings');
});

test('shift history shows clock-in and clock-out notes', async ({ page }) => {
  await loginAs(page, 'housekeeping');
  await page.getByLabel('Clock-in note (optional)').fill('Opening rooms');
  await page.getByRole('button', { name: 'Clock in' }).click();
  await expect(page.locator('.notice')).toHaveText(/Clocked in/);

  await page.getByLabel('Clock-out note (optional)').fill('Rooms finished');
  await page.getByRole('button', { name: 'Clock out' }).click();
  await expect(page.locator('.notice')).toHaveText(/Clocked out/);

  await expect(page.getByText('In note: Opening rooms')).toBeVisible();
  await expect(page.getByText('Out note: Rooms finished')).toBeVisible();
});

test('owner settings load areas and accept tables', async ({ page }) => {
  await loginAs(page, 'owner');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Settings' })
    .click();
  await expect(page.getByText(/schema 16/)).toBeVisible();

  await page.getByLabel('Area name', { exact: true }).fill('E2E Terrace');
  await page.getByRole('button', { name: 'Add area' }).click();
  await expect(
    page.getByRole('heading', { name: 'E2E Terrace', level: 3 }),
  ).toBeVisible();

  await page.getByRole('combobox', { name: 'Area' }).selectOption({
    label: 'E2E Terrace',
  });
  await page.getByLabel('Table name', { exact: true }).fill('T-E2E');
  await page.getByRole('button', { name: 'Add table' }).click();
  await expect(page.getByText('T-E2E', { exact: true })).toBeVisible();
});

test('stock toggle hides Stock from owner and manager', async ({ page }) => {
  await loginAs(page, 'owner');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Settings' })
    .click();
  await page.getByRole('button', { name: 'Turn stock management off' }).click();
  await expect(page.getByText(/Stock management disabled/)).toBeVisible();
  expect(await navButtons(page)).not.toContain('Stock');

  await loginAs(page, 'manager');
  const managerNav = await navButtons(page);
  expect(managerNav).not.toContain('Stock');
  expect(managerNav).not.toContain('Settings');
  expect(managerNav).toContain('Staff');
});

test('registers the service worker and exposes an update check', async ({
  page,
}) => {
  await loginAs(page, 'owner');
  await page.waitForFunction(
    async () => Boolean(await navigator.serviceWorker.getRegistration()),
    undefined,
    { timeout: 15_000 },
  );
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Settings' })
    .click();
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.locator('.notice')).toHaveText(
    /Checked for updates|installed app/,
  );
});

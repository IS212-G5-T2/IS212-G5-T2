import { expect, test, type Page } from '@playwright/test';

// Playwright runs in Node; this browser project's TypeScript setup omits Node globals.
declare const process: { env: { DRAFT_TEST_API_URL?: string } };

type Fields = Record<string, string | number | boolean | null>;
type Draft = { id: string; organisationId: string; organiserId: string; status: string; fields: Fields; version: number; createdAt: string; updatedAt: string };
const empty: Fields = { name: '', purpose: '', description: '', startDateTime: '', endDateTime: '', expectedAttendance: null, venueRequirements: '', accessibilityNeeds: '', equipmentRequirements: '', layout: '', registrationEnabled: null };
const complete: Fields = { ...empty, name: 'Customer workshop', purpose: 'Training', description: 'Saved details', startDateTime: '2026-10-01T10:00', endDateTime: '2026-10-01T12:00', expectedAttendance: 25, venueRequirements: 'Training room', accessibilityNeeds: 'Wheelchair access', equipmentRequirements: 'Projector', layout: 'Classroom', registrationEnabled: false };
const makeDraft = (id: string, fields = complete, status = 'draft', organisationId = 'org-a'): Draft => ({ id, organisationId, organiserId: 'organiser', status, fields, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

async function mockApi(page: Page, initial: Draft[] = [], failFirstSave = false) {
  // Store test drafts in memory so browser tests never change real customer data.
  const drafts = new Map(initial.map(item => [item.id, structuredClone(item)]));
  const operations: string[] = [];
  let fail = failFirstSave;
  await page.route('**/event-requests**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const organisationId = 'org-a';
    if (request.method() === 'GET' && path === '/event-requests') return route.fulfill({ json: [...drafts.values()].filter(item => item.organisationId === organisationId) });
    const id = path.split('/')[2];
    const current = drafts.get(id);
    if (request.method() === 'GET') return current?.organisationId === organisationId ? route.fulfill({ json: current }) : route.fulfill({ status: 404, json: {} });
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { fields: Fields; version: number; operationId: string };
      operations.push(body.operationId);
      if (fail) { fail = false; return route.abort('failed'); }
      if (current && current.organisationId !== organisationId) return route.fulfill({ status: 404, json: {} });
      if (current && current.status !== 'draft') return route.fulfill({ status: 409, json: {} });
      const now = new Date().toISOString();
      const saved = { id, organisationId, organiserId: 'organiser', status: 'draft', fields: body.fields, version: body.version + 1, createdAt: current?.createdAt ?? now, updatedAt: now };
      drafts.set(id, saved); return route.fulfill({ json: saved });
    }
    return route.fallback();
  });
  return { drafts, operations };
}

test.describe('SPM-37 Save event request as a draft', () => {
  test.describe('I can save my event request as a draft without submitting it', () => {
    // Saving from the create page creates a Draft record without using the submit action.
    test('AC1 saves without submitting', async ({ page }) => {
      // Open the form, enter one value and choose Save draft.
      const api = await mockApi(page); await page.goto('/events/create');
      await page.locator('#event-name').fill('Planning session'); await page.getByRole('button', { name: 'Save draft' }).click();
      // Confirm My Requests displays the save confirmation and one Draft record.
      await expect(page).toHaveURL('/events'); await expect(page.getByText('Draft saved successfully. It has not been submitted.')).toBeVisible();
      await expect(page.getByText('Draft', { exact: true })).toBeVisible(); expect([...api.drafts.values()][0].status).toBe('draft'); expect(api.drafts.size).toBe(1);
    });
  });

  test.describe("My draft is saved with 'Draft' status even if required fields are incomplete", () => {
    // Every mandatory field may remain empty when the organiser chooses Save draft.
    test('AC2 saves incomplete mandatory fields', async ({ page }) => {
      // Open a blank form and save it without entering anything.
      const api = await mockApi(page); await page.goto('/events/create'); await expect(page.locator('form [required]')).toHaveCount(11);
      await page.getByRole('button', { name: 'Save draft' }).click();
      // Confirm the saved request remains a Draft with an empty name.
      await expect(page).toHaveURL('/events'); await expect(page.getByText('Draft saved successfully. It has not been submitted.')).toBeVisible(); expect([...api.drafts.values()][0]).toMatchObject({ status: 'draft', fields: { name: '' } });
    });
    // Venue and equipment requirements can be entered as multiple rows while the request is still a draft.
    test('AC2 adds venue and equipment requirement rows', async ({ page }) => {
      // Add another row under each header and enter values across the available columns.
      const api = await mockApi(page); await page.goto('/events/create');
      const addButtons = page.getByRole('button', { name: 'Add row' }); await addButtons.nth(0).click(); await addButtons.nth(1).click();
      await page.getByLabel('Venue requirements Requirement row 1').fill('Near MRT');
      await page.getByLabel('Venue requirements Details row 2').fill('Level access');
      await page.getByLabel('Equipment requirements Equipment item row 1').fill('Projector');
      await page.getByLabel('Equipment requirements Quantity row 1').fill('2');
      // Save and check that every row and column is retained in the draft payload.
      await page.getByRole('button', { name: 'Save draft' }).click(); await expect(page.getByText('Draft saved successfully. It has not been submitted.')).toBeVisible();
      const saved = [...api.drafts.values()][0];
      expect(JSON.parse(saved.fields.venueRequirements as string)).toEqual([{ requirement: 'Near MRT' }, { details: 'Level access' }]);
      expect(JSON.parse(saved.fields.equipmentRequirements as string)).toEqual([{ item: 'Projector', quantity: '2' }]);
      // Reopen the listed draft, refresh it and confirm the structured rows are still pre-filled.
      await page.getByRole('link', { name: /Untitled event request/ }).click(); await expect(page.getByText('Draft saved successfully.')).toBeVisible(); await page.reload();
      await expect(page.getByLabel('Venue requirements Requirement row 1')).toHaveValue('Near MRT');
      await expect(page.getByLabel('Venue requirements Details row 2')).toHaveValue('Level access');
      await expect(page.getByLabel('Equipment requirements Equipment item row 1')).toHaveValue('Projector');
      await expect(page.getByLabel('Equipment requirements Quantity row 1')).toHaveValue('2');
    });
  });

  test.describe("I can access and reopen my draft from 'My Requests' list, with all previously entered values pre-filled", () => {
    // A listed draft reopens with saved text, number and choice values restored.
    test('AC3 reopens all saved values', async ({ page }) => {
      // Prepare a saved request, open My Requests and follow its link.
      await mockApi(page, [makeDraft('ac3')]); await page.goto('/events'); await page.getByRole('link', { name: /Customer workshop/ }).click();
      // Confirm different field types are pre-filled.
      await expect(page.locator('#event-name')).toHaveValue('Customer workshop'); await expect(page.locator('#expected-attendance')).toHaveValue('25'); await expect(page.getByLabel('attendees register for event through the system')).toHaveValue('no');
    });
  });

  test.describe('While my request is in Draft status, I can modify and save it multiple times. Each save updates the same request without creating duplicates, and reopening it shows the latest successfully saved values.', () => {
    // Multiple saves update one record and reopening shows the latest successful value.
    test('AC4 updates without duplicates', async ({ page }) => {
      // Open one draft, save a change, and reopen it from My Requests before saving again.
      const api = await mockApi(page, [makeDraft('ac4')]); await page.goto('/requests/ac4');
      for (const name of ['Second version', 'Latest version']) { await page.locator('#event-name').fill(name); await page.getByRole('button', { name: 'Save draft' }).click(); await expect(page.getByText('Draft saved successfully. It has not been submitted.')).toBeVisible(); await page.getByRole('link', { name: new RegExp(name) }).click(); }
      // Reopen and confirm the newest value is stored in the only record.
      await page.reload(); await expect(page.locator('#event-name')).toHaveValue('Latest version'); expect(api.drafts.size).toBe(1);
    });
  });

  test.describe('After successfully saving a draft, I can refresh the page or sign out and sign back in, then reopen it with all saved values preserved.', () => {
    // Saved values survive refresh and become available again after a new session begins.
    test('AC5 preserves values across refresh without login', async ({ page }) => {
      // Save a draft and verify a normal refresh keeps its value.
      await mockApi(page); await page.goto('/events/create'); await page.locator('#event-name').fill('Persistent draft'); await page.getByRole('button', { name: 'Save draft' }).click(); await page.getByRole('link', { name: /Persistent draft/ }).click(); const url = page.url();
      await page.reload(); await expect(page.locator('#event-name')).toHaveValue('Persistent draft');
      // Clear cookies and reopen the request; anonymous drafts do not depend on a login session.
      await page.context().clearCookies(); await page.goto(url); await expect(page.locator('#event-name')).toHaveValue('Persistent draft');
    });
  });

  test.describe('When my draft saves successfully, I see a confirmation message. If saving fails, I see an error, my entered values remain in the form, and I can retry.', () => {
    // A failed save retains entered work and retrying the same operation succeeds.
    test('AC6 reports failure and supports retry', async ({ page }) => {
      // Make the first save fail, enter work and try to save it.
      const api = await mockApi(page, [], true); await page.goto('/events/create'); await page.locator('#description').fill('Keep this work'); await page.getByRole('button', { name: 'Save draft' }).click();
      // Confirm the error and entered value remain, then retry.
      await expect(page.getByRole('alert')).toBeVisible(); await expect(page.locator('#description')).toHaveValue('Keep this work'); await page.getByRole('button', { name: 'Retry save' }).click();
      // Confirm success and that retry used the same save operation.
      await expect(page.getByText('Draft saved successfully. It has not been submitted.')).toBeVisible(); expect(api.operations[1]).toBe(api.operations[0]);
    });
  });

  // AC7 organisation isolation is deferred by the user until authentication is integrated.
  test.describe('Once my request has been submitted, I cannot modify it using the draft-editing flow. Further changes must follow the Event Change Requests workflow.', () => {
    // A submitted request does not expose draft controls through current or legacy URLs.
    test('AC8 blocks draft editing after submission', async ({ page }) => {
      // Prepare a submitted request and open its normal URL.
      await mockApi(page, [makeDraft('submitted', complete, 'submitted')]); await page.goto('/requests/submitted');
      // Confirm change-request guidance replaces draft editing controls.
      await expect(page.getByText(/Further changes must follow/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
      // Confirm the older edit URL is protected too.
      await page.goto('/events/submitted/edit'); await expect(page.locator('#event-name')).toHaveCount(0);
    });
  });
});

// This suite uses the real backend harness and PostgreSQL, with no login or mocked draft responses.
test.describe('SPM-37 anonymous drafts through the real API', () => {
  test.skip(!process.env.DRAFT_TEST_API_URL, 'Start the backend database harness and set DRAFT_TEST_API_URL.');
  // A visitor saves unfinished work, reloads it, updates it and reopens it in a fresh browser context without signing in.
  test('creates, persists and updates a draft without authentication', async ({ page, browser }) => {
    // Forward browser API traffic to the isolated real backend test database.
    const connectApi = async (target: Page) => target.route('**/event-requests**', async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: process.env.DRAFT_TEST_API_URL + url.pathname + url.search });
      await route.fulfill({ response });
    });
    await connectApi(page);
    await page.goto('/events/create');
    const name = 'Anonymous browser check ' + Date.now();
    await page.locator('#event-name').fill(name);
    // Save without filling mandatory submission fields or supplying a login token.
    const created = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/draft'));
    await page.getByRole('button', { name: 'Save draft' }).click();
    const response = await created;
    expect(response.status()).toBe(200);
    expect(response.request().headers().authorization).toBeUndefined();
    expect(response.request().headers().cookie).toBeUndefined();
    const draft = await response.json();
    await expect(page.getByText('Draft saved successfully. It has not been submitted.')).toBeVisible();
    await page.getByRole('link', { name }).click();
    await page.reload();
    await expect(page.locator('#event-name')).toHaveValue(name);
    // Update the same record and verify its revision advances rather than creating another draft.
    await page.locator('#event-name').fill(name + ' updated');
    const updated = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/draft'));
    await page.getByRole('button', { name: 'Save draft' }).click();
    const latest = await (await updated).json();
    expect(latest.id).toBe(draft.id);
    expect(latest.version).toBe(draft.version + 1);
    // A fresh browser context can reopen the persisted shared draft without signing in.
    const context = await browser.newContext();
    try {
      const fresh = await context.newPage();
      await connectApi(fresh);
      await fresh.goto('http://127.0.0.1:4173/requests/' + draft.id);
      await expect(fresh.locator('#event-name')).toHaveValue(name + ' updated');
    } finally { await context.close(); }
  });
});

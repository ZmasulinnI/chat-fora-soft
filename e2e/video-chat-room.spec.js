import { expect, test } from '@playwright/test';

test('creates a room, joins a second participant and exchanges chat', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    await firstPage.goto('/');
    await enterName(firstPage, 'Алекс', 'Создать комнату');
    await expect(firstPage).toHaveURL(/\/room\/[A-Za-z0-9_-]+$/);

    const roomUrl = firstPage.url();

    await secondPage.goto(roomUrl);
    await enterName(secondPage, 'Мария', 'Войти');

    await expectParticipant(firstPage, 'Алекс');
    await expectParticipant(firstPage, 'Мария');
    await expectParticipant(secondPage, 'Алекс');
    await expectParticipant(secondPage, 'Мария');

    await firstPage.getByLabel('Сообщение').fill('Привет из первой вкладки');
    await firstPage.getByRole('button', { name: 'Отправить' }).click();

    await expect(firstPage.getByText('Алекс:')).toBeVisible();
    await expect(firstPage.getByText('Привет из первой вкладки')).toBeVisible();
    await expect(secondPage.getByText('Алекс:')).toBeVisible();
    await expect(secondPage.getByText('Привет из первой вкладки')).toBeVisible();
  } finally {
    await secondContext.close();
    await firstContext.close();
  }
});

test('shows the first participant video to a newly joined participant', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const thirdContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();
  const thirdPage = await thirdContext.newPage();

  try {
    await firstPage.goto('/');
    await enterName(firstPage, 'Алекс', 'Создать комнату');

    const roomUrl = firstPage.url();

    await secondPage.goto(roomUrl);
    await enterName(secondPage, 'Мария', 'Войти');

    await expectRemoteVideoReady(secondPage, 'Алекс');
    await expectRemoteVideoReady(firstPage, 'Мария');

    await thirdPage.goto(roomUrl);
    await enterName(thirdPage, 'Никита', 'Войти');

    await expectRemoteVideoReady(firstPage, 'Никита');
    await expectRemoteVideoReady(secondPage, 'Никита');
    await expectRemoteVideoReady(thirdPage, 'Алекс');
    await expectRemoteVideoReady(thirdPage, 'Мария');
  } finally {
    await thirdContext.close();
    await secondContext.close();
    await firstContext.close();
  }
});

test('restores remote camera video after toggling it without toggling microphone', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    await firstPage.goto('/');
    await enterName(firstPage, 'Алекс', 'Создать комнату');

    await secondPage.goto(firstPage.url());
    await enterName(secondPage, 'Мария', 'Войти');

    await expectRemoteVideoReady(secondPage, 'Алекс');

    await firstPage.getByRole('button', { name: 'Выключить камеру' }).click();
    await expect(secondPage.locator('.video-tile').filter({ hasText: 'Алекс' }).getByText('камера выключена')).toBeVisible();

    await firstPage.getByRole('button', { name: 'Включить камеру' }).click();
    await expectRemoteVideoReady(secondPage, 'Алекс');
  } finally {
    await secondContext.close();
    await firstContext.close();
  }
});

test('shows microphone and camera state changes in the room UI', async ({ page }) => {
  await page.goto('/');
  await enterName(page, 'Алекс', 'Создать комнату');

  await expect(page.getByRole('button', { name: 'Выключить микрофон' })).toBeVisible();
  await page.getByRole('button', { name: 'Выключить микрофон' }).click();
  await expect(page.getByRole('button', { name: 'Включить микрофон' })).toBeVisible();

  await page.getByRole('button', { name: 'Выключить камеру' }).click();
  await expect(page.getByText('камера выключена')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Включить камеру' })).toBeVisible();
});

test('shows duplicate display name error inside a room', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    await firstPage.goto('/');
    await enterName(firstPage, 'Алекс', 'Создать комнату');

    await secondPage.goto(firstPage.url());
    await submitName(secondPage, 'Алекс', 'Войти');

    await expect(secondPage.getByText('Этот никнейм уже занят в комнате')).toBeVisible();
    await expect(secondPage.getByRole('button', { name: 'Повторить вход' })).toBeVisible();
  } finally {
    await secondContext.close();
    await firstContext.close();
  }
});

test('shows room full error for the fifth participant', async ({ browser }) => {
  const contexts = [];

  try {
    const ownerContext = await browser.newContext();
    contexts.push(ownerContext);
    const ownerPage = await ownerContext.newPage();

    await ownerPage.goto('/');
    await enterName(ownerPage, 'User 1', 'Создать комнату');

    const roomUrl = ownerPage.url();

    for (let index = 2; index <= 4; index += 1) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();

      await page.goto(roomUrl);
      await enterName(page, `User ${index}`, 'Войти');
      await expectParticipant(ownerPage, `User ${index}`);
    }

    const fifthContext = await browser.newContext();
    contexts.push(fifthContext);
    const fifthPage = await fifthContext.newPage();

    await fifthPage.goto(roomUrl);
    await submitName(fifthPage, 'User 5', 'Войти');

    await expect(fifthPage.getByText('Комната заполнена')).toBeVisible();
    await expect(fifthPage.getByRole('button', { name: 'Повторить вход' })).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('uses mobile video focus and chat drawer layout', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  try {
    await page.goto('/');
    await enterName(page, 'Алекс', 'Создать комнату');

    const localTile = page.locator('.video-tile').filter({ hasText: 'Алекс' });

    await expect(page.locator('.room-sidebar')).not.toHaveClass(/is-open/);
    await page.getByRole('button', { name: 'Открыть чат' }).click();
    await expect(page.locator('.room-sidebar')).toHaveClass(/is-open/);
    await page.getByRole('button', { name: 'Закрыть чат' }).click();
    await expect(page.locator('.room-sidebar')).not.toHaveClass(/is-open/);

    await localTile.click();
    await expect(page.locator('.video-grid')).toHaveAttribute('data-focused', 'true');
    await localTile.click();
    await expect(page.locator('.video-grid')).toHaveAttribute('data-focused', 'false');
  } finally {
    await context.close();
  }
});

async function enterName(page, displayName, buttonName) {
  await submitName(page, displayName, buttonName);
  await expect(page.getByText('Подключено')).toBeVisible();
}

async function submitName(page, displayName, buttonName) {
  await page.getByLabel('Имя').fill(displayName);
  await page.getByRole('button', { name: buttonName }).click();
}

async function expectParticipant(page, displayName) {
  await expect(page.locator('.participants-list li').filter({ hasText: displayName })).toBeVisible();
}

async function expectRemoteVideoReady(page, displayName) {
  const video = page.locator('.video-tile').filter({ hasText: displayName }).locator('video');

  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((element) => element.videoWidth)).toBeGreaterThan(100);
}

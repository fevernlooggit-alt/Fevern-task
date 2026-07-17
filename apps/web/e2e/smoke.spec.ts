import { test, expect, type Page } from '@playwright/test';

// Phase 3 acceptance gate (PRD §9):
//   login → claim (via reply auto-claim) → reply → collision banner on a second
//   session → resolve; monitor page renders real metrics.
//
// Prereq: seeded DB (npm -w @icrm/api run db:seed). The seed contains the handoff
// ticket "夺宝抽奖结果没有到账" (PW-1042) in tenant Parallel World.

const KENDRICK = 'kendrick@parallelworld.example';
const KCLIM = 'kclim@parallelworld.example';
const PASSWORD = 'password123';
const HANDOFF_SUBJECT = '夺宝抽奖结果没有到账';

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByRole('heading', { name: '收件箱' })).toBeVisible();
}

test('console smoke: login → claim → reply → collision → resolve → monitor', async ({ browser }) => {
  // --- session 1: Kendrick claims via reply ---
  const ctx1 = await browser.newContext();
  const page1 = await ctx1.newPage();
  await login(page1, KENDRICK);

  // Narrow to the handoff queue (robust against pagination), then open the ticket.
  await page1.getByRole('button', { name: '待转人工' }).click();
  await page1.getByText(HANDOFF_SUBJECT).first().click();
  await expect(page1.locator('.chat-head h3')).toContainText(HANDOFF_SUBJECT);

  // reply auto-claims: handoff → human, lock held by Kendrick
  await page1.getByPlaceholder('输入回复… (Enter 发送)').fill('您好，我是人工客服，正在为您核查夺宝发放记录。');
  await page1.getByRole('button', { name: '发送' }).click();
  await expect(page1.locator('.chat-head .pill')).toHaveText('人工处理');
  await expect(page1.locator('.msgs .m-agent').last()).toContainText('人工客服');

  // --- session 2: KC Lim sees the collision banner and a disabled composer ---
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await login(page2, KCLIM);
  await page2.getByText(HANDOFF_SUBJECT).first().click();
  await expect(page2.getByTestId('collision-banner')).toBeVisible();
  await expect(page2.getByTestId('collision-banner')).toContainText('Kendrick Chan');
  await expect(page2.getByPlaceholder('输入回复… (Enter 发送)')).toBeDisabled();
  await expect(page2.getByRole('button', { name: '转人工', exact: true })).toBeDisabled();

  // --- session 1 resolves ---
  await page1.getByRole('button', { name: '标记解决' }).click();
  await expect(page1.locator('.chat-head .pill')).toHaveText('已解决');

  // --- monitor renders real metrics ---
  await page1.getByRole('button', { name: /监控/ }).click();
  await expect(page1.getByRole('heading', { name: '监控看板' })).toBeVisible();
  await expect(page1.getByTestId('mon-today')).not.toHaveText('');
  await expect(page1.getByText('三层路由命中分布')).toBeVisible();
  await expect(page1.getByText('Kendrick Chan')).toBeVisible();

  await ctx1.close();
  await ctx2.close();
});

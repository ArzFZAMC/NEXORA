import { test, expect } from '@playwright/test';

const email = process.env.E2E_EMAIL; const password = process.env.E2E_PASSWORD;

test('halaman masuk tampil dan registrasi hanya lewat kode undangan', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'NEXORA' })).toBeVisible();
  await page.getByRole('radio', { name: 'Daftar' }).click();
  await expect(page.getByLabel('Kode undangan')).toBeVisible();
});

test('validasi form masuk menolak email tidak valid', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('bukan-email');
  await page.getByLabel('Password').fill('12345678');
  await page.getByRole('button', { name: 'Masuk' }).last().click();
  await expect(page.getByRole('alert')).toContainText('Format email');
});

test.describe('dengan akun uji', () => {
  test.skip(!email || !password, 'Set E2E_EMAIL dan E2E_PASSWORD untuk menjalankan tes ini');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Masuk' }).last().click();
    await expect(page.getByText('Aktivitas hari ini')).toBeVisible({ timeout: 15_000 });
  });

  test('navigasi responsif: sidebar di desktop, bottom nav di mobile', async ({ page, isMobile }) => {
    if (isMobile) { await expect(page.locator('nav.fixed.bottom-0')).toBeVisible(); await expect(page.locator('aside')).toBeHidden(); }
    else { await expect(page.locator('aside')).toBeVisible(); await expect(page.locator('nav.fixed.bottom-0')).toBeHidden(); }
  });

  test('membuat aktivitas lalu menyelesaikannya memberi XP satu kali', async ({ page }) => {
    const title = `E2E ${Date.now()}`;
    await page.getByRole('button', { name: 'Aktivitas baru' }).click();
    await page.getByLabel('Judul').fill(title);
    await page.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByText(title)).toBeVisible();
    await page.getByRole('button', { name: 'Selesaikan' }).first().click();
    await expect(page.getByText(/\+\d+ XP/).first()).toBeVisible();
  });
});

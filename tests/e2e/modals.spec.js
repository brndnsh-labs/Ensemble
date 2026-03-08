import { test, expect } from '@playwright/test';

test.describe('Modals Responsiveness @ui', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.app-main-layout')).toHaveClass(/loaded/);
  });

  test('Settings Modal - Centering and Content @mobile', async ({ page }) => {
    // Open settings modal
    await page.click('#settingsBtn');
    
    // Select modal content specifically to verify it's correctly centered and styled
    const settingsModal = page.locator('#settingsOverlay .modal-content');
    await expect(settingsModal).toBeVisible();

    // Verify visual layout (e.g., labels, selects, toggles)
    await expect(settingsModal).toHaveScreenshot('settings-modal-mobile.png');

    // Close modal
    await page.click('#closeSettingsBtn');
    await expect(settingsModal).not.toBeVisible();
  });

  test('Editor Modal - Mobile Layout @mobile', async ({ page }) => {
    // Open editor modal (the 'Edit Arrangement' button)
    await page.click('#editArrangementBtn');

    const editorModal = page.locator('#editorOverlay .modal-content');
    await expect(editorModal).toBeVisible();

    // The editor has complex forms, check responsiveness
    await expect(editorModal).toHaveScreenshot('editor-modal-mobile.png');

    // Close modal
    await page.click('#closeEditorBtn');
    await expect(editorModal).not.toBeVisible();
  });
});

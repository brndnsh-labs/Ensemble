import pkg from '@playwright/test';

const { expect } = pkg;

export async function expectWithinSurface(surface, control) {
    const [surfaceBox, controlBox] = await Promise.all([
        surface.boundingBox(),
        control.boundingBox(),
    ]);

    expect(surfaceBox).not.toBeNull();
    expect(controlBox).not.toBeNull();
    expect(controlBox.x).toBeGreaterThanOrEqual(surfaceBox.x - 1);
    expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(
        surfaceBox.x + surfaceBox.width + 1,
    );
    expect(controlBox.y).toBeGreaterThanOrEqual(surfaceBox.y - 1);
    expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(
        surfaceBox.y + surfaceBox.height + 1,
    );
}

export async function expectLocatorFitsViewport(page, locator, overflowTarget = locator) {
    await expect
        .poll(async () => {
            const viewport = page.viewportSize();
            const box = await locator.boundingBox();

            if (!viewport || !box) {
                return false;
            }

            const overflowMetrics = await overflowTarget.evaluate((el) => ({
                clientWidth: el.clientWidth,
                scrollWidth: el.scrollWidth,
            }));

            return (
                box.x >= 0 &&
                box.y >= 0 &&
                box.x + box.width <= viewport.width &&
                box.y + box.height <= viewport.height &&
                overflowMetrics.scrollWidth <= overflowMetrics.clientWidth + 1
            );
        })
        .toBe(true);
}

export async function expectSurfaceFitsViewport(page, surface) {
    await expectLocatorFitsViewport(
        page,
        surface,
        surface.locator('.workspace-studio-surface-body'),
    );
}

export async function expectNoHorizontalOverflow(locator) {
    const overflowMetrics = await locator.evaluate((el) => ({
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
    }));

    expect(overflowMetrics.scrollWidth).toBeLessThanOrEqual(overflowMetrics.clientWidth + 1);
}

export async function expectNoVerticalOverflow(locator, tolerance = 24) {
    await expect
        .poll(async () => locator.evaluate((el) => el.scrollHeight - el.clientHeight))
        .toBeLessThanOrEqual(tolerance);
}

export async function expectOwnsInteriorProbe(locator) {
    const ownsInteriorProbe = await locator.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const x = Math.min(rect.left + 24, rect.right - 4);
        const y = Math.min(rect.top + 24, rect.bottom - 4);
        const probe = document.elementFromPoint(x, y);
        return !!probe && el.contains(probe);
    });

    expect(ownsInteriorProbe).toBe(true);
}

export async function expectScrollsToRevealTarget(page, scrollContainer, target) {
    void page;
    const metrics = await scrollContainer.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollTop: el.scrollTop,
    }));

    if (metrics.scrollHeight <= metrics.clientHeight + 24) {
        await expect(target).toBeVisible();
        return;
    }

    await target.scrollIntoViewIfNeeded();
    await expect(target).toBeVisible();
    await expect
        .poll(async () => scrollContainer.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
}

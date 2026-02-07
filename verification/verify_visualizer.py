from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080")

        # Wait for app to load
        expect(page.locator("#app-container, .app-container")).to_be_visible()

        # Click the Visualizer Power Button to enable it
        page.click("#vizPowerBtn")

        # Wait for canvas to appear inside #unifiedVizContainer
        # The UnifiedVisualizer appends a canvas to the container.
        expect(page.locator("#unifiedVizContainer canvas")).to_be_visible()

        # Take screenshot
        page.screenshot(path="verification/visualizer.png")

        browser.close()

if __name__ == "__main__":
    run()

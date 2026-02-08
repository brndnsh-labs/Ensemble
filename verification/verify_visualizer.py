from playwright.sync_api import sync_playwright, expect
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the local server
        page.goto("http://localhost:8080/")

        # Wait for app to load
        expect(page.locator("h1")).to_have_text("Ensemble")

        # Click the Visualizer power button to expand it
        # It might be collapsed initially
        viz_panel = page.locator("#panel-visualizer")

        # Check if collapsed
        # expect(viz_panel).to_have_class(re.compile(r"collapsed")) # optional check

        # Click power button
        page.click("#vizPowerBtn")

        # Wait for expansion (collapsed class removal)
        expect(viz_panel).not_to_have_class("collapsed")

        # Check if canvas exists inside the container
        canvas = page.locator("#unifiedVizContainer canvas").first
        expect(canvas).to_be_visible()

        # Wait a bit for rendering
        time.sleep(1)

        # Take screenshot
        page.screenshot(path="verification/visualizer_verified.png")

        print("Screenshot taken: verification/visualizer_verified.png")

        browser.close()

if __name__ == "__main__":
    run()

from playwright.sync_api import sync_playwright

def verify_sequencer_grid():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a large desktop viewport
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})

        # Navigate to the app
        page.goto("http://localhost:8080")

        # Click "Grooves" tab if on mobile, or ensure Groove panel is visible
        # Check if we need to switch to "Classic" tab in Grooves
        # The button text is "Classic" inside the Groove panel.

        # Wait for the app to load
        page.wait_for_selector("#panel-grooves", state="attached")

        # Click "Classic" button in Groove Panel to ensure we are on the right tab
        # We need to target the one inside #panel-grooves
        classic_btn = page.locator("#panel-grooves button", has_text="Classic")
        if classic_btn.is_visible():
            classic_btn.click()

        # Wait for the sequencer grid steps to be visible
        steps = page.locator("#sequencerGrid .step")
        steps.first.wait_for(state="visible", timeout=5000)

        print(f"Found {steps.count()} steps")

        # Click on the first step
        steps.first.click()

        # Wait for update
        page.wait_for_timeout(500)

        # Take a screenshot
        page.screenshot(path="verification/sequencer_grid.png")

        print("Screenshot saved to verification/sequencer_grid.png")
        browser.close()

if __name__ == "__main__":
    verify_sequencer_grid()

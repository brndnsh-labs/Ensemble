from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Capture console messages
    page.on("console", lambda msg: print(f"Console: {msg.text}"))
    page.on("pageerror", lambda err: print(f"Page Error: {err}"))

    page.goto("http://localhost:8080")

    # Enable Visualizer
    try:
        page.wait_for_selector("#vizPowerBtn", timeout=5000)
        page.click("#vizPowerBtn")
        print("Clicked Visualizer Power Button")
    except Exception as e:
        print(f"Error clicking viz button: {e}")

    # Wait for canvas to be visible
    try:
        page.wait_for_selector("canvas", state="visible", timeout=5000)
        print("Canvas is visible!")
        page.screenshot(path="verification_screenshot_visible.png")
    except Exception as e:
        print(f"Error waiting for visible canvas: {e}")
        page.screenshot(path="error_screenshot_visible.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)

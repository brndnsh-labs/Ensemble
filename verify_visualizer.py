from playwright.sync_api import sync_playwright
import time

def verify_visualizer():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:8080")

        # Ensure Visualizer is ON
        print("Ensuring Visualizer is ON...")
        page.wait_for_selector("#vizPowerBtn")

        # Check if collapsed
        panel = page.locator("#panel-visualizer")
        if "collapsed" in panel.get_attribute("class"):
            print("Visualizer is collapsed. Clicking power button...")
            page.click("#vizPowerBtn")
            time.sleep(1) # Wait for expansion

        # Now wait for container
        print("Waiting for visualizer container...")
        page.wait_for_selector("#unifiedVizContainer")

        # Click Play
        print("Clicking Play...")
        page.click("#playBtn")

        print("Waiting for playback...")
        time.sleep(5)

        print("Taking screenshot...")
        page.screenshot(path="verification_visualizer.png")

        browser.close()
        print("Done.")

if __name__ == "__main__":
    verify_visualizer()

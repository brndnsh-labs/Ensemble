import re
from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080")
        page.wait_for_selector("#panel-grooves", timeout=5000)
        page.locator("#panel-grooves").get_by_text("Classic").click()
        page.wait_for_selector(".step", timeout=5000)
        first_step = page.locator(".step").first

        # Click
        box = first_step.bounding_box()
        if box:
            page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            page.mouse.down()
            page.mouse.up()

        page.wait_for_timeout(500)
        page.screenshot(path="/home/jules/verification.png")
        browser.close()

if __name__ == "__main__":
    run()

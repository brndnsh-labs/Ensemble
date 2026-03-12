from playwright.sync_api import sync_playwright
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:8081/index.html')
    time.sleep(2)

    # Or just open EditorModal directly
    page.click("id=arrangerActionTrigger")
    time.sleep(1)
    page.click("id=clearProgBtn")
    time.sleep(1)
    page.screenshot(path='screenshot3.png')
    browser.close()

with sync_playwright() as playwright:
    run(playwright)

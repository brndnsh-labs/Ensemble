from playwright.sync_api import sync_playwright
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:8081/index.html')
    time.sleep(2)

    # Or just open settings directly:
    page.click("id=settingsBtn")
    time.sleep(1)
    page.click("id=resetSettingsBtn")
    time.sleep(1)
    page.screenshot(path='screenshot2.png')
    browser.close()

with sync_playwright() as playwright:
    run(playwright)

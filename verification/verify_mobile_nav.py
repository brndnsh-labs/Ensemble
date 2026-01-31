from playwright.sync_api import Page, expect, sync_playwright
import re

def test_mobile_nav(page: Page):
    # Mobile viewport
    page.set_viewport_size({"width": 375, "height": 667})

    page.goto("http://localhost:8000")

    # Wait for app to load
    page.wait_for_selector(".app-container")

    # Check default state: Chords panel should be visible
    print("Checking Chords Panel...")
    chords_panel = page.locator("#panel-chords")
    # It might take a moment for state to hydrate?
    # Use a relaxed check for active-mobile class
    expect(chords_panel).to_have_class(re.compile(r"active-mobile"))
    expect(chords_panel).to_be_visible()

    # Click Grooves tab
    print("Clicking Grooves Tab...")
    grooves_tab = page.locator(".mobile-tabs-nav").get_by_text("Grooves")
    grooves_tab.click(force=True)

    # Check Grooves panel visible
    print("Checking Grooves Panel...")
    grooves_panel = page.locator("#panel-grooves")
    expect(grooves_panel).to_have_class(re.compile(r"active-mobile"))
    expect(grooves_panel).to_be_visible()

    # Click Bass tab
    print("Clicking Bass Tab...")
    bass_tab = page.locator(".mobile-tabs-nav").get_by_text("Bass")
    bass_tab.click(force=True)

    # Check Bass panel visible
    print("Checking Bass Panel...")
    bass_panel = page.locator("#panel-bass")
    expect(bass_panel).to_have_class(re.compile(r"active-mobile"))
    expect(bass_panel).to_be_visible()

    page.screenshot(path="/home/jules/verification/verification.png")
    print("Verification complete.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_mobile_nav(page)
        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
            raise
        finally:
            browser.close()

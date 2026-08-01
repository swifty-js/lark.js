from playwright.sync_api import sync_playwright

GEN = "/Users/hangtiancheng/github/swifty.js/lark.js/packages/lark-docs/.lark-docs/generated/index.js"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:5173/swifty/base/")
    page.wait_for_load_state("networkidle")

    served = page.evaluate(
        """async () => {
            const r = await fetch('/@fs%s');
            const t = await r.text();
            return { status: r.status, hasBase: t.includes('"/swifty/base"'),
                     hasOnUpdate: t.includes('onContentUpdate'), len: t.length };
        }""" % GEN)
    print("served generated module:", served)

    # call the app's own loadContent through State (guard-wrapped)
    result = page.evaluate(
        """async () => {
            const mod = await import('/@fs%s');
            const direct = await mod.loadContent('/swifty/base');
            return { directNull: direct === null,
                     directTitle: direct?.pageData?.title ?? null,
                     routesHasBase: '/swifty/base' in (mod.routes || {}) };
        }""" % GEN)
    print("direct module import:", result)
    browser.close()

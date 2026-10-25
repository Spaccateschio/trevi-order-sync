"""Authenticated browser regression; synthetic unit settings and intercepted saves, no real writes."""
import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        cookies = json.loads(os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON") or "[]")
        if cookies:
            await context.add_cookies([{**c, "url": "http://localhost:8080"} for c in cookies])
        page = await context.new_page()
        await page.goto("http://localhost:8080")
        await page.evaluate("([k,v])=>localStorage.setItem(k,v)", [os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"], os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]])
        saved = []
        calls = []
        forbidden = []
        mode = "reject"
        async def intercept(route):
            nonlocal saved
            request = route.request
            if "/rest/v1/product_purchase_units" in request.url:
                if request.method == "GET":
                    await route.fulfill(json=saved)
                else:
                    forbidden.append("direct table write")
                    await route.abort()
                return
            if request.method == "POST" and "/_serverFn/" in request.url:
                # Only the requested save is allowed to pass once, on a synthetic product ID.
                text = request.post_data or ""
                if "defaultUnitId" in text and "unitIds" in text:
                    calls.append(text)
                    if mode == "reject":
                        await route.continue_()
                    else:
                        unit_ids = await page.locator('[aria-label="U.M. proprie del prodotto"]').get_by_role("button", name="Predefinita", exact=False).count()
                        assert unit_ids == 1
                        await route.fulfill(json={"result": {"saved": True}, "context": {}})
                    return
            if "/rest/v1/products?" in request.url and request.method == "GET":
                response = await route.fetch()
                rows = await response.json()
                if isinstance(rows, list):
                    for row in rows:
                        if row.get("description") == "ANANAS COSTA RICA":
                            row["id"] = "00000000-0000-4000-8000-000000000099"
                    await route.fulfill(response=response, json=rows)
                    return
            if request.method == "POST" and "/rest/v1/rpc/" in request.url:
                if any(word in request.url for word in ("manage_", "set_", "save_", "confirm_", "generate_")):
                    forbidden.append("unexpected command")
                    await route.abort()
                    return
            await route.continue_()
        await page.route("**/*", intercept)
        await page.goto("http://localhost:8080/acquisti/prodotti")
        await page.get_by_text("ANANAS COSTA RICA", exact=True).first.click()
        await page.get_by_role("tab", name="Acquisto", exact=True).click()
        await page.get_by_role("button", name="Aggiungi U.M. di acquisto del prodotto", exact=True).click()
        menu = page.get_by_role("dialog").last
        await menu.get_by_role("button", name="kg — Chilogrammo", exact=True).click()
        await page.get_by_role("button", name="Predefinita kg", exact=True).click()
        save = page.get_by_role("button", name="Salva U.M. di acquisto", exact=True)
        assert await save.is_enabled()
        await save.click()
        await page.get_by_text("Prodotto non disponibile", exact=True).wait_for()
        assert await save.is_enabled()  # rejection preserves draft
        assert len(calls) == 1
        mode = "mock"
        # Discover chosen ID from the captured serialized payload without printing credentials.
        payload = json.loads(calls[0])
        def strings(value):
            if isinstance(value, str): return [value]
            if isinstance(value, list): return sum([strings(x) for x in value], [])
            if isinstance(value, dict): return sum([strings(x) for x in value.values()], [])
            return []
        candidates = [s for s in strings(payload) if len(s) == 36 and s.count("-") == 4 and s != "00000000-0000-4000-8000-000000000099"]
        assert candidates
        saved = [{"unit_id": candidates[0], "is_default": True}]
        await save.click()
        await page.get_by_text("U.M. di acquisto salvate", exact=True).wait_for()
        await page.reload()
        await page.get_by_text("ANANAS COSTA RICA", exact=True).first.click()
        await page.get_by_role("tab", name="Acquisto", exact=True).click()
        star = page.get_by_role("button", name="Predefinita kg", exact=True)
        await star.wait_for()
        assert await star.get_attribute("aria-pressed") == "true"
        await page.get_by_role("button", name="Acquisto diretto", exact=True).click()
        assert await page.get_by_text("Acquisto diretto — compro io", exact=True).count() == 1
        Path("/tmp/browser/purchase-units").mkdir(parents=True, exist_ok=True)
        await page.screenshot(path="/tmp/browser/purchase-units/reopened.png")
        assert not forbidden
        print("PASS: authenticated unknown-product rejection, retained draft, simulated save/readback, direct-purchase units; no operational writes")
        await browser.close()

asyncio.run(main())
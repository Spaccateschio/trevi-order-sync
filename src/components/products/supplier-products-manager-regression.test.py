"""Authenticated read-only regression: shared supplier identity, units and retry. No business writes."""
import asyncio
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.async_api import async_playwright

SUPPLIER = "3916fcda-7649-4d1b-b171-79141442fb69"
PRODUCT = "a73c4a6b-5d5c-4463-a933-4163407673ec"

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
        mode = "read"
        blocked = []
        link_reads = []
        async def intercept(route):
            request = route.request
            if "/rest/v1/" in request.url and request.method not in ("GET", "HEAD"):
                if "/rpc/" not in request.url or any(x in request.url for x in ("manage_", "set_", "save_", "confirm_", "generate_", "create_", "toggle_")):
                    blocked.append("operational request blocked")
                    await route.abort()
                    return
            if request.method == "GET" and "/rest/v1/product_supplier_links?" in request.url:
                params = parse_qs(urlparse(request.url).query)
                if params.get("supplier_record_id") == ["eq." + SUPPLIER] and "product_supplier_link_units(" in params.get("select", [""])[0]:
                    assert "units_of_measure!product_supplier_link_units_unit_id_fkey(code)" in params["select"][0]
                    if mode == "error":
                        await route.fulfill(status=300, json={"code": "PGRST201", "message": "Simulated read failure"})
                        return
                    response = await route.fetch()
                    assert response.status == 200, "Supplier links read failed"
                    rows = await response.json()
                    basil = [r for r in rows if r["product_id"] == PRODUCT]
                    assert len(basil) == 1
                    assert basil[0]["origin"] == "manuale" and basil[0]["supplier_product_code"] is None
                    assert any(u["units_of_measure"]["code"] == "cassa" for u in basil[0]["product_supplier_link_units"])
                    link_reads.append(rows)
                    await route.fulfill(response=response, json=rows)
                    return
            await route.continue_()
        await page.route("**/*", intercept)
        await page.goto("http://localhost:8080/acquisti/fornitori")
        await page.get_by_text("AZIENDA AGRICOLA ALESSANDRO BERTONI", exact=True).first.click()
        await page.get_by_role("tab", name="Prodotti forniti", exact=True).click()
        await page.get_by_text("BASILICO ERBE AROMATICHE IT A MAZZI", exact=True).first.wait_for()
        section = page.locator('section[aria-labelledby="supplier-products-title"]')
        assert await section.get_by_text("cassa ★", exact=True).count() or await section.get_by_text("cassa", exact=True).count()
        Path("/tmp/browser/supplier-links").mkdir(parents=True, exist_ok=True)
        await section.screenshot(path="/tmp/browser/supplier-links/bertoni.png")
        print("PASS 1: real authenticated supplier read includes manual BASILICO with cassa and matching supplier ID")
        mode = "error"
        await page.reload()
        await page.get_by_text("AZIENDA AGRICOLA ALESSANDRO BERTONI", exact=True).first.click()
        await page.get_by_role("tab", name="Prodotti forniti", exact=True).click()
        await page.get_by_role("alert").filter(has_text="Impossibile caricare").wait_for(timeout=20000)
        assert await section.get_by_text("Nessun prodotto associato a questo fornitore.", exact=True).count() == 0
        assert await section.get_by_role("button", name="Aggiungi prodotti", exact=True).is_disabled()
        await section.screenshot(path="/tmp/browser/supplier-links/error.png")
        print("PASS 2: read failure is not an empty list and blocks adding from missing data")
        mode = "read"
        await section.get_by_role("button", name="Riprova", exact=True).click()
        await section.get_by_text("BASILICO ERBE AROMATICHE IT A MAZZI", exact=True).first.wait_for()
        assert await section.get_by_role("button", name="Aggiungi prodotti", exact=True).is_enabled()
        print("PASS 3: retry restores existing associations")
        await page.goto("http://localhost:8080/acquisti/prodotti?prodotto=" + PRODUCT)
        await page.get_by_role("tab", name="Acquisto", exact=True).click()
        await page.get_by_text("AZIENDA AGRICOLA ALESSANDRO BERTONI", exact=True).first.wait_for()
        print("PASS 4: existing product view reads the same BERTONI association")
        assert not blocked
        assert len(link_reads) >= 2
        print("No operational writes; association tests remain manual on 3 EMME")
        await browser.close()

asyncio.run(main())
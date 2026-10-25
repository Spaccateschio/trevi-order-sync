"""Run with python3; authenticated preview, synthetic rows, all REST writes intercepted."""
import asyncio
import json
import os
from pathlib import Path

from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        cookies = json.loads(os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON") or "[]")
        if cookies:
            await context.add_cookies([{**c, "url": "http://localhost:8080"} for c in cookies])
        await page.goto("http://localhost:8080")
        await page.evaluate("([k,v])=>localStorage.setItem(k,v)", [
            os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"],
            os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"],
        ])
        screenshots = Path("/tmp/browser/record-new/screenshots")
        screenshots.mkdir(parents=True, exist_ok=True)
        calls = []
        unexpected_writes = []

        async def intercept(route):
            request = route.request
            if request.method == "GET":
                if "/customer_records?" in request.url or "/supplier_records?" in request.url:
                    await route.fulfill(json=[{
                        "id": "00000000-0000-4000-8000-000000000001",
                        "legal_name": "Anagrafica fittizia A",
                        "status": "attivo", "assigned_price_list_number": None,
                        "delivery_weekdays": [1], "delivery_month_day": None,
                    }, {
                        "id": "00000000-0000-4000-8000-000000000002",
                        "legal_name": "Anagrafica fittizia B", "status": "attivo",
                        "assigned_price_list_number": None,
                        "delivery_weekdays": [2], "delivery_month_day": None,
                    }])
                    return
                await route.continue_()
                return
            if request.method == "OPTIONS":
                await route.continue_()
                return
            if "/rpc/resolve_default_price_list" in request.url:
                await route.fulfill(json=None)
                return
            if any("/rpc/" + name in request.url for name in (
                "manage_customer_record", "manage_supplier_record", "set_supplier_delivery_schedule",
            )):
                calls.append((request.url.split("/rpc/")[-1], request.post_data_json))
                await route.fulfill(json="00000000-0000-4000-8000-000000000003")
                return
            unexpected_writes.append(request.url.split("/rest/v1/")[-1])
            await route.abort()

        await page.route("**/rest/v1/**", intercept)
        for path, kind in [("vendite/clienti", "cliente"), ("acquisti/fornitori", "fornitore")]:
            await page.goto("http://localhost:8080/" + path)
            row = page.locator("tbody tr").first
            await row.locator("td").nth(1).click()
            aside = page.locator('aside[aria-label="Scheda ' + kind + '"]')
            field = aside.locator("input").nth(3)
            await field.fill("Modifica non salvata")
            await page.wait_for_timeout(200)
            await page.get_by_role("button", name="Nuovo " + kind, exact=True).click()
            alert = page.get_by_role("alertdialog")
            await alert.wait_for()
            await alert.get_by_role("button", name="Continua a modificare").click()
            assert await field.input_value() == "Modifica non salvata"
            assert await page.get_by_role("dialog").count() == 0
            await page.get_by_role("button", name="Nuovo " + kind, exact=True).click()
            await page.get_by_role("alertdialog").get_by_role("button", name="Scarta e apri").click()
            dialog = page.get_by_role("dialog")
            await dialog.wait_for()
            assert await aside.locator("input").count() == 0
            assert await dialog.locator("input").nth(3).input_value() == ""
            await dialog.locator("input").nth(3).fill("Nuova anagrafica fittizia")
            await page.keyboard.press("Escape")
            await dialog.wait_for(state="hidden")
            assert await aside.get_by_role("button", name="Salva").count() == 0
            assert not calls
            await page.get_by_role("button", name="Nuovo " + kind, exact=True).click()
            await dialog.locator("input").nth(3).fill("Nuova anagrafica fittizia")
            await dialog.get_by_role("button", name="Salva", exact=True).click()
            await dialog.wait_for(state="hidden")
            name, payload = calls[0]
            assert name == "manage_" + ("customer" if kind == "cliente" else "supplier") + "_record"
            assert payload["_action"] == "create"
            assert payload["_legal_name"] == "Nuova anagrafica fittizia"
            assert "_customer_record_id" not in payload and "_supplier_record_id" not in payload
            assert await aside.get_by_role("button", name="Salva").count() == 0
            calls.clear()
            await row.locator("td").nth(1).click()
            await aside.locator("input").nth(3).fill("Aggiornamento fittizio")
            await aside.get_by_role("button", name="Salva", exact=True).click()
            await page.wait_for_timeout(500)
            assert calls[0][1]["_action"] == "update"
            id_key = "_customer_record_id" if kind == "cliente" else "_supplier_record_id"
            assert calls[0][1][id_key] == "00000000-0000-4000-8000-000000000001"
            calls.clear()
            await page.screenshot(path=str(screenshots / (kind + "-after.png")))
            print(kind + ": dirty cancel/discard, New dismissal, mocked create/update passed")
        assert not unexpected_writes, unexpected_writes
        await browser.close()


asyncio.run(main())
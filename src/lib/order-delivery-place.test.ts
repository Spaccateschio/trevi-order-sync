import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  DELIVERY_PLACE_MANUAL,
  DELIVERY_PLACE_PICKUP,
  DELIVERY_PLACE_PICKUP_TEXT,
  deliveryPlaceFromSelection,
  deliveryPlaceSelectValue,
  normalizeDeliveryPlace,
  shouldSaveDeliveryPlace,
} from "./order-delivery-place";

const addresses = [{ id: "sede-1", text: "Magazzino — Via Roma 10, Frosinone", functions: ["consegna"] }];
const savedPlaces = [{ id: "frase-1", text: "Consegna al banco laterale" }];

describe("luogo dell'ordine fornitore", () => {
  it("un indirizzo delle impostazioni conserva il collegamento e il testo aggiornato", () => {
    const result = deliveryPlaceFromSelection("sede-1", { address: "Vecchio", addressId: null, savePlace: true }, addresses, savedPlaces);
    assert.deepEqual(result, { address: "Magazzino — Via Roma 10, Frosinone", addressId: "sede-1", savePlace: false });
  });

  it("il ritiro toglie il collegamento all'indirizzo e usa la frase esatta", () => {
    const result = deliveryPlaceFromSelection(DELIVERY_PLACE_PICKUP, { address: "Magazzino", addressId: "sede-1", savePlace: true }, addresses, savedPlaces);
    assert.deepEqual(result, { address: DELIVERY_PLACE_PICKUP_TEXT, addressId: null, savePlace: false });
  });

  it("una frase salvata resta testo libero e non diventa un indirizzo delle impostazioni", () => {
    const result = deliveryPlaceFromSelection("salvato:frase-1", { address: "", addressId: "sede-1", savePlace: true }, addresses, savedPlaces);
    assert.deepEqual(result, { address: "Consegna al banco laterale", addressId: null, savePlace: false });
    assert.equal(deliveryPlaceSelectValue(result, addresses, savedPlaces), "salvato:frase-1");
  });

  it("passando a un testo manuale non conserva per errore indirizzo o ritiro precedenti", () => {
    const fromAddress = deliveryPlaceFromSelection(DELIVERY_PLACE_MANUAL, { address: "Magazzino", addressId: "sede-1", savePlace: false }, addresses, savedPlaces);
    const fromPickup = deliveryPlaceFromSelection(DELIVERY_PLACE_MANUAL, { address: DELIVERY_PLACE_PICKUP_TEXT, addressId: null, savePlace: false }, addresses, savedPlaces);
    assert.deepEqual(fromAddress, { address: "", addressId: null, savePlace: false });
    assert.deepEqual(fromPickup, { address: "", addressId: null, savePlace: false });
  });

  it("salva per il futuro solo un testo libero richiesto e non vuoto", () => {
    assert.equal(shouldSaveDeliveryPlace({ address: "  Passo   io dopo le 16  ", addressId: null, savePlace: true }), true);
    assert.equal(normalizeDeliveryPlace("  Passo   io dopo le 16  "), "Passo io dopo le 16");
    assert.equal(shouldSaveDeliveryPlace({ address: "   ", addressId: null, savePlace: true }), false);
    assert.equal(shouldSaveDeliveryPlace({ address: "Magazzino", addressId: "sede-1", savePlace: true }), false);
    assert.equal(shouldSaveDeliveryPlace({ address: "Solo questo ordine", addressId: null, savePlace: false }), false);
  });
});

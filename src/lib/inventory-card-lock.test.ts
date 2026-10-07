import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { inventoryCardLocked, afterInventoryCardSave, canEditInventoryCard } from './inventory-card-lock';

describe('Blocco della card inventario', () => {
  it('blocca una quantità confermata', () => assert.equal(inventoryCardLocked(true, false, false, false), true));
  it('la matita sblocca la card confermata', () => assert.equal(inventoryCardLocked(true, true, false, false), false));
  it('una conferma riuscita la riblocca', () => assert.equal(inventoryCardLocked(true, afterInventoryCardSave(true, true), false, false), true));
  it('una conferma fallita la lascia modificabile', () => assert.equal(inventoryCardLocked(true, afterInventoryCardSave(true, false), false, false), false));
  it('non consente modifiche su card bloccata', () => assert.equal(canEditInventoryCard(true, false, false), false));
  it('non consente modifiche durante il salvataggio', () => assert.equal(canEditInventoryCard(false, true, false), false));
  it('mantiene il blocco del ciclo anche con la matita ordinaria', () => assert.equal(inventoryCardLocked(true, true, true, false), true));
  it('mantiene la correzione autorizzata del ciclo', () => assert.equal(inventoryCardLocked(true, false, true, true), false));
  it('lascia modificabili i prodotti non confermati', () => assert.equal(inventoryCardLocked(false, false, false, false), false));
  it('non consente quantità senza U.M.', () => assert.equal(canEditInventoryCard(false, false, true), false));
});

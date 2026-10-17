import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARE_CHANNELS, shareHref, shareRecipientError, priceUnitDiffers, isClosedListUndoError } from './order-sharing';
import { orderShareText } from '../components/shopping/generation-results';

test('sette canali autorizzati, senza canali inventati',()=>assert.deepEqual(SHARE_CHANNELS.map(c=>c.value),['whatsapp','email','sms','telefono','di_persona','altro','copia_testo']));
test('email richiede destinatario',()=>{assert.ok(shareRecipientError('email',''));assert.equal(shareRecipientError('email','supplier@example.test'),null);});
test('WhatsApp richiede telefono',()=>assert.ok(shareRecipientError('whatsapp','')));
test('SMS richiede telefono',()=>assert.ok(shareRecipientError('sms','')));
test('email include destinatario e note complete',()=>{const uri=shareHref('email','supplier@example.test','ORD-4','Note: consegna al cancello');assert.equal(uri,'mailto:supplier%40example.test?subject=Ordine%20ORD-4&body=Note%3A%20consegna%20al%20cancello');});
test('WhatsApp usa il destinatario indicato',()=>assert.equal(shareHref('whatsapp','+39 333 8131442','ORD-4','Mele'),'https://wa.me/393338131442?text=Mele'));
test('SMS apre il numero indicato',()=>assert.equal(shareHref('sms','+39 333 8131442','ORD-4','Mele'),'sms:+393338131442?body=Mele'));
test('canali manuali non aprono servizi esterni',()=>{for(const c of ['telefono','di_persona','altro','copia_testo'] as const) assert.equal(shareHref(c,'','ORD-4','Mele'),null);});
test('messaggio conserva 2 kg e note, senza prezzo 1.85 né conversione in casse',()=>{
 const text=orderShareText('ORD-3','Breda',[{product_name:'Pomodori',product_code:'00-018',purchase_quantity:2,purchase_unit_code:'kg'}],'',{date:'2026-10-18',from:'08:00',to:'10:00',address:'Via del Mandrione 63',notes:'Suonare al cancello'});
 assert.ok(text.includes('00-018 Pomodori: 2 kg')); assert.ok(text.includes('Suonare al cancello')); assert.ok(text.includes('2026-10-18'));assert.ok(text.includes('08:00 – 10:00'));assert.ok(text.includes('Via del Mandrione 63'));assert.equal(text.includes('1.85'),false); assert.equal(text.includes('€'),false);
});
test('U.M. prezzo cs diversa da quantità kg, senza equivalenza',()=>assert.equal(priceUnitDiffers('cs','kg'),true));
test('U.M. uguali e mancanti non sono dichiarate differenti',()=>{assert.equal(priceUnitDiffers('KG','kg'),false);assert.equal(priceUnitDiffers(null,'kg'),false);});


test('rettifica: Lista chiusa distingue soltanto il blocco delle attività successive',()=>{
 assert.equal(isClosedListUndoError('Attività successive incompatibili: conferma non annullabile','chiusa'),true);
 for (const status of ['aperta','annullata',null]) assert.equal(isClosedListUndoError('Attività successive incompatibili: conferma non annullabile',status),false);
 assert.equal(isClosedListUndoError('Solo amministratore dell’azienda proprietaria','chiusa'),false);
 assert.equal(isClosedListUndoError('Conferma non annullabile','chiusa'),false);
});

# Roadmap

## In corso
- [x] Revisione Vendite → Prodotti, punto 1: archivi Danea + import per archivio (con test)
- [x] Punto 2: griglia Prodotti professionale (selezione globale dell’intero risultato filtrato, menu Colonne persistente, ridimensionamento fluido, preferenze automatiche per utente/dispositivo, stampa/esportazione)
- [x] Punto 3: U.M. Trevi Fruit (8 U.M. aziendali iniziali non assegnate, anagrafica, U.M. per prodotto, conversione stimata facoltativa, gestione multipla, cambio U.M. Danea in revisione)
- [x] Rifinitura Punto 3: U.M. rapide in cima al dettaglio e dati Danea collassabili (test desktop/smartphone)
- [x] Correzione UX U.M.: secondo clic richiude l’editor; rimozione separata e confermata (test CICORIA desktop/smartphone)
- [x] Punto 4: immagini Trevi Fruit (senza coda periodica; validazione prima del cambio, cancellazione best-effort con audit)
- [x] Punto 5a: collegamento B2B — relazione unica venditore→acquirente, stati in attesa/attivo/rifiutato/revocato, doppio consenso (interruttore per lato), invito lato venditore, pagina Clienti
- [x] Punto 5b: anagrafica clienti del venditore (non registrati), P.IVA normalizzata e inviti B2B con token/scadenza/reinvio/annullamento
- [x] Punto 5b.1: registrazione cliente da invito con precompilazione, registrazione autonoma con richiesta di collegamento, indirizzi multipli con visibilità esplicita verso i partner
- [ ] Punto 5b.2: destinazioni cliente (punto operativo/centro documentale) sopra gli indirizzi + importazione massiva clienti da file Danea con anteprima e invito multiplo
- [ ] Punto 5c: condizioni commerciali per rapporto (listino Danea, catalogo visibile), ereditate dal cliente con possibile override per destinazione

## Completato
- [x] Importazione manuale file Danea (Opzione B) con stesso parser/motore
- [x] Pagina Vendite → Prodotti: elenco unico, ricerca, filtri, dettaglio consultazione
- [x] Endpoint diretto Danea: risposta sempre esattamente "OK" quando l'import riesce
- [x] Storico invii con origine "Importazione manuale" / postazione

## Fuori scope per ora
- Inventario, carico/scarico merce, giacenze, Ordina
- Download ordini da Danea
- Sistema avanzato di ruoli
- Modifica prodotti da Trevi Fruit (Danea resta il gestionale)
- Conversioni U.M. realmente fisse (da valutare con carico merci/inventario)

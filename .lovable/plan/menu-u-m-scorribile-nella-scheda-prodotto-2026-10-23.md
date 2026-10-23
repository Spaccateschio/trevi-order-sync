# Menu U.M. scorribile nella scheda prodotto

## Modifica proposta
- Rendere l'elenco «Aggiungi U.M. vendita» scorribile con rotella del mouse, barra laterale e gesto del dito, senza far scorrere la scheda sottostante.
- Inserire «+ Nuova U.M.» dentro lo stesso elenco, anche quando non ci sono altre U.M. disponibili.
- Premendo «+ Nuova U.M.» aprire un riquadro nella scheda, senza cambiare pagina, con **Sigla**, **Descrizione** e **Uso** (inizialmente «Entrambi»).
- La nuova U.M. non viene associata automaticamente al prodotto: la scegli tu dal menu quando vuoi. La U.M. principale di Danea rimane invariata.

## Fasi e verifiche
1. Prima realizzare la proposta visiva in anteprima: scorrimento funzionante e apertura/chiusura del riquadro, senza salvare nuove U.M.
2. Dopo approvazione della proposta visiva, collegare il salvataggio allo stesso comando già usato in Impostazioni → Unità di misura, mantenendo autorizzazioni e controlli sulle sigle esistenti. Aggiornare l'elenco senza associazione automatica al prodotto.
3. Verificare mouse e dito, apertura del riquadro e permanenza nella scheda; nessuna scrittura nei dati reali durante le prove.

## Dettagli tecnici e file autorizzati
- `src/components/products/sales-unit-manager.tsx`: area scorribile, voce nuova U.M. e riquadro di creazione; nella prima fase solo stato locale.
- `src/components/products/AGENTS.md`: documentare la creazione separata dall'associazione al prodotto.
- Per la seconda fase usare `manageUnitOfMeasure` già esistente, senza modificare i file server, la pagina Impostazioni o lo schema del database.

## Limiti
- Nessuna modifica a ordini, giacenze, Danea o `roadmap.md`.
- Nessuna pubblicazione.
- Il menu attuale ha già un contenitore scorribile: verificare l'interazione dentro la scheda aperta, non soltanto l'aspetto della barra.
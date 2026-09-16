# Correzione indirizzo Danea

## Problema confermato
La pagina Gestionale costruisce l’indirizzo Danea dall’indirizzo della pagina aperta. Nell’anteprima copia quindi il dominio di anteprima, che intercetta la richiesta prima dell’autenticazione Danea. I registri confermano richieste senza credenziali e nessun tentativo associato alla postazione attiva.

## Modifica proposta
- Modificare esclusivamente la pagina **Gestionale**.
- Mostrare e copiare sempre l’indirizzo pubblico stabile:
  `https://trevi-order-sync.lovable.app/api/public/danea/products`
- Non modificare postazioni, password, hashing, autenticazione HTTP Basic, importazione prodotti o database.

## Verifica
- Controllare che dalla pagina di anteprima venga copiato l’indirizzo pubblico stabile.
- Verificare che l’indirizzo risponda con la richiesta credenziali Danea prevista.
- Verificare un accesso con credenziali valide e uno con password errata.
- Rimuovere gli eventuali soli dati creati per il test.

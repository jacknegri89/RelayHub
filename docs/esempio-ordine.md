# Dal negozio al gestionale

RelayHub riceve webhook firmati da un’applicazione, li inoltra in modo asincrono alle destinazioni configurate e conserva l’esito di ogni tentativo. Puoi usarlo, per esempio, per inviare lo stesso evento di acquisto al gestionale e al servizio di notifiche.

1. Crea una sorgente per il negozio e due destinazioni, una per ciascun servizio. Collega entrambe alla sorgente con il filtro `order.created`.
2. Quando arriva un ordine, il negozio invia il JSON firmato con un ID evento stabile. RelayHub risponde `202` dopo aver salvato in PostgreSQL l’evento e le due consegne. Se riceve di nuovo lo stesso ID dalla stessa sorgente con gli stessi byte durante la conservazione dell’evento, risponde `200` con l’ID già assegnato. Un contenuto diverso per quell’ID produce `409`.
3. Il worker consegna il messaggio separatamente ai due servizi. Se le notifiche rispondono con successo e il gestionale va in timeout, riprova la consegna al gestionale con lo stesso ID. Il numero di tentativi automatici è limitato.
4. Il gestionale verifica la firma v2, salva l’ID di consegna e registra l’ordine nella stessa transazione. Se la conferma HTTP si perde dopo il salvataggio, al tentativo successivo riconosce la ricevuta e risponde con successo. Per proteggere l’ordine anche da nuovi eventi commerciali oltre la durata delle ricevute, il gestionale deve mantenere un vincolo univoco sul proprio identificativo d’ordine.

## Come osservare il risultato

Apri **Eventi** e seleziona l’ordine per seguirne le due consegne. La cronologia di ciascuna indica orari, durata, esito HTTP o mancata risposta. **Panoramica** confronta l’attività recente e mostra i tempi di risposta P50, P95 e P99. In **Destinazioni** puoi aprire i tentativi falliti di uno dei sette giorni, attivare gli avvisi email e, dopo un ripristino, selezionare le consegne ancora fallite da reinviare.

Un sistema di reportistica può leggere questi dati con una chiave di sola lettura creata dal proprietario in **Impostazioni**. Le risposte delle API pubbliche per eventi e consegne contengono metadati. Il contratto e i formati delle richieste sono nel [documento OpenAPI](api.yaml).

## Riprodurre la risposta persa

Avvia lo stack locale e prepara i dati dimostrativi seguendo la [guida ai test](testing.md#seed-and-replay-fixtures). Esegui `pnpm demo lost-response` e apri l’evento `demo.lost-response`. Il primo tentativo arriva al ricevitore, che registra l’ordine e lascia scadere la risposta. Il tentativo successivo riceve HTTP 200 perché l’ordine è già registrato. Il [ricevitore dimostrativo](receiver-idempotency.md) mostra dove avvengono il controllo della firma e il salvataggio.

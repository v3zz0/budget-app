const CACHE = "budget-push-dispositivo-v1";
const MARCA = "/.budget-push-dispositivo";
const idValido = /^[a-z0-9]{24}$/;

async function dispositivoAttivo(impronta) {
  if (typeof impronta !== "string" || !/^[a-f0-9]{64}$/.test(impronta)) return false;
  const cache = await caches.open(CACHE);
  const marca = await cache.match(MARCA);
  return impronta === await marca?.text();
}

function avviso(dati) {
  if (dati.tipo === "prova") {
    return { titolo: "Notifica di prova", corpo: "Questo dispositivo può ricevere gli avvisi di Budget App.", url: "/impostazioni#notifiche" };
  }

  if (!idValido.test(dati.riferimento)) return null;
  if (dati.tipo === "invito") {
    return { titolo: "Ti hanno invitato in un portafoglio condiviso", corpo: "Apri Budget App per accettare o rifiutare.", url: "/" };
  }
  if (dati.tipo === "scadenza" && /^\d{4}-\d{2}-\d{2}$/.test(dati.giorno)) {
    const parametri = new URLSearchParams({ scadenza: dati.riferimento, giorno: dati.giorno });
    return { titolo: "Hai una scadenza in arrivo", corpo: "Apri Budget App per vedere i dettagli.", url: `/ricorrenti?${parametri}` };
  }
  if (dati.tipo === "budget" && idValido.test(dati.portafoglio) && /^\d{4}-(0[1-9]|1[0-2])$/.test(dati.mese)) {
    const parametri = new URLSearchParams({ portafoglio: dati.portafoglio, categoria: dati.riferimento, mese: dati.mese });
    return { titolo: "Hai superato un budget", corpo: "Apri Budget App per vedere i dettagli.", url: `/?${parametri}` };
  }
  return null;
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let dati;
    try { dati = event.data?.json(); } catch { return; }
    if (!dati || !await dispositivoAttivo(dati.dispositivo)) return;
    const notifica = avviso(dati);
    if (!notifica) return;
    await self.registration.showNotification(notifica.titolo, {
      body: notifica.corpo,
      icon: "/app-192.png",
      tag: dati.tag,
      data: { url: notifica.url, dispositivo: dati.dispositivo },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const dati = event.notification.data;
    if (!await dispositivoAttivo(dati?.dispositivo)) return;
    const url = new URL(dati.url, self.location.origin);
    if (url.origin !== self.location.origin) return;

    const finestre = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const esistente = finestre.find((client) => client.url === url.href);
    if (esistente) return esistente.focus();
    return self.clients.openWindow(url.href);
  })());
});

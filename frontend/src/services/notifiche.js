import { api, apiUrl } from "./api.js";

const URL_API = "/api/notifiche";
const CACHE = "budget-push-dispositivo-v1";
const MARCA = "/.budget-push-dispositivo";
const CHIAVE_BROWSER = "budget-push-browser";
let registrazione;
let ultimaOperazione = Promise.resolve();

export function supportaNotifiche() {
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window &&
    "Notification" in window && "caches" in window;
}

function preparaWorker() {
  registrazione ??= navigator.serviceWorker.register("/budget-sw.js")
    .then(() => navigator.serviceWorker.ready)
    .catch((e) => { registrazione = null; throw e; });
  return registrazione;
}

async function improntaDi(iscrizione) {
  if (!iscrizione) return null;
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(iscrizione.endpoint));
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function marcaAttiva() {
  const cache = await caches.open(CACHE);
  return (await cache.match(MARCA))?.text();
}

function inCoda(operazione) {
  const inCorso = ultimaOperazione.then(operazione);
  ultimaOperazione = inCorso.catch(() => {});
  return inCorso;
}

async function revocaSulServer(impronta, token) {
  if (!impronta || !token) return;
  try {
    await fetch(`${apiUrl}${URL_API}/dispositivi/${impronta}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
      signal: AbortSignal.timeout(3500),
    });
  } catch {
    // Il permesso locale è già rimosso, anche se il server è irraggiungibile.
  }
}

async function disiscrivi(reg, iscrizione, token) {
  const [impronta, marca] = await Promise.all([improntaDi(iscrizione), marcaAttiva()]);
  await caches.delete(CACHE);
  await Promise.allSettled([
    reg?.getNotifications().then((lista) => lista.forEach((n) => n.close())),
    iscrizione?.unsubscribe(),
    revocaSulServer(impronta || marca, token),
  ]);
}

export async function statoNotifiche() {
  let impronta = null;
  let marca = null;
  let worker = false;
  if (supportaNotifiche()) {
    try {
      const reg = await preparaWorker();
      impronta = await improntaDi(await reg.pushManager.getSubscription());
      marca = await marcaAttiva();
      worker = true;
    } catch {
      // Le preferenze si possono caricare anche se questo browser non si registra.
    }
  }
  const { data } = await api.get(URL_API, { params: { impronta } });
  return { ...data, worker, attivo: worker && data.attivo && !!impronta && marca === impronta && Notification.permission === "granted" };
}

export async function salvaPreferenze(preferenze) {
  return (await api.put(`${URL_API}/preferenze`, preferenze)).data;
}

function decodificaChiave(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export async function attivaNotifiche(publicKey) {
  const token = localStorage.getItem("token");
  const permesso = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permesso !== "granted") return false;

  return inCoda(async () => {
    const stessoUtente = () => !!token && localStorage.getItem("token") === token;
    if (!stessoUtente()) return false;
    const reg = await preparaWorker();
    const chiave = decodificaChiave(publicKey);
    let iscrizione = await reg.pushManager.getSubscription();
    const esistente = new Uint8Array(iscrizione?.options.applicationServerKey ?? []);
    if (iscrizione && (esistente.length !== chiave.length || esistente.some((b, i) => b !== chiave[i]))) {
      await disiscrivi(reg, iscrizione, token);
      iscrizione = null;
    }
    iscrizione ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiave });
    if (!stessoUtente()) {
      await disiscrivi(reg, iscrizione, token);
      return false;
    }
    try {
      const idBrowser = localStorage.getItem(CHIAVE_BROWSER) || crypto.randomUUID();
      localStorage.setItem(CHIAVE_BROWSER, idBrowser);
      const { data } = await api.put(`${URL_API}/dispositivi`, { ...iscrizione.toJSON(), idBrowser }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data.impronta !== await improntaDi(iscrizione)) throw new Error("Iscrizione del dispositivo non valida.");
      if (stessoUtente()) {
        const cache = await caches.open(CACHE);
        await cache.put(MARCA, new Response(data.impronta));
        if (stessoUtente()) return true;
      }
    } catch (e) {
      await disiscrivi(reg, iscrizione, token);
      throw e;
    }
    await disiscrivi(reg, iscrizione, token);
    return false;
  });
}

export function disattivaNotifiche(token = localStorage.getItem("token")) {
  if (!supportaNotifiche()) return Promise.resolve();
  return inCoda(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const iscrizione = await reg?.pushManager.getSubscription();
    await disiscrivi(reg, iscrizione, token);
  });
}

export async function provaNotifiche() {
  const impronta = await marcaAttiva();
  if (!impronta) throw new Error("Attiva le notifiche su questo dispositivo.");
  await api.post(`${URL_API}/dispositivi/${impronta}/prova`);
}

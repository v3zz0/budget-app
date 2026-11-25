<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import { useMovimentoStore } from "@/stores/movimento.js";
import { caricaConto, caricaMese } from "@/services/dashboard.js";
import { attivaVersamentoAutomatico, muoviSalvadanaio, statoSalvadanaio } from "@/services/salvadanaio.js";
import { meseDaCuiPrendere, piano } from "@/utils/piano.js";
import { nomeMese } from "@/utils/budget.js";
import { aggiornaTransazione, creaTransazione, eliminaTransazione, trovaTransazione } from "@/services/transazioni.js";
import { creaCategoria } from "@/services/impostazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { erroreScontrino, leggiScontrino } from "@/services/scontrino.js";
import { dataIt } from "@/utils/budget.js";
import { eur } from "@/utils/formato.js";
import { categoriaOmonima, nomeCategoria } from "@/utils/impostazioni.js";
import { appiattisci, isoLocale, parseImporto, perGiorno, testoImporto, totali } from "@/utils/movimenti.js";
import Interruttore from "@/components/Interruttore.vue";
import MeseNav from "@/components/MeseNav.vue";
import SceltaEmoji from "@/components/SceltaEmoji.vue";
import Avatar from "@/components/Avatar.vue";
import { altro, bilancio, effetto, miaQuota, saldoCassa } from "@/utils/conti.js";

// id presente (dalla route) = modifica nello stesso foglio, assente = nuova
// foglio = dentro il foglio "Nuovo movimento" (components/MovimentoSheet.vue, §23):
// solo il form, le opzioni arrivano da opz invece che dall'indirizzo.
const props = defineProps({ id: { type: String, default: null }, foglio: Boolean, opz: { type: Object, default: () => ({}) } });
const emit = defineEmits(["chiudi", "salvato"]);

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const toast = useToast();
const walletStore = useWalletStore();
const mov = useMovimentoStore();
// Telefono: la pagina è solo lo storico, si registra e si modifica dal foglio (§23)
const telefono = ref(matchMedia("(max-width: 640px)").matches);
const q = computed(() => (props.foglio ? { ...props.opz, ricorrente: props.opz.ricorrente ? "1" : undefined } : route.query));
const avviso = (severity, summary, detail) => toast.add({ severity, summary, detail, life: 3500 });

const oggi = new Date();
const OGGI = isoLocale(oggi);
const IERI = isoLocale(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - 1));

// ── Elenco del mese ──────────────────────────────────────────────────────────
const mese = ref({ anno: oggi.getFullYear(), mese: oggi.getMonth() + 1 });
const categorie = ref([]); // del portafoglio, con le transazioni del mese
const loading = ref(false);
const errore = ref(null);
const filtro = ref("tutti");
const evidenziato = ref(null); // movimento appena salvato

let ultima = 0;
async function carica() {
  const n = ++ultima;
  if (!walletStore.walletId) return (categorie.value = []);
  loading.value = true;
  errore.value = null;
  try {
    const lista = await caricaMese(walletStore.walletId, mese.value);
    if (n === ultima) categorie.value = lista;
  } catch (e) {
    if (n === ultima) errore.value = erroreLeggibile(e);
  } finally {
    if (n === ultima) loading.value = false;
  }
}
watch(() => walletStore.walletId, carica, { immediate: true });
function sposta(passo) {
  const d = new Date(mese.value.anno, mese.value.mese - 1 + passo, 1);
  mese.value = { anno: d.getFullYear(), mese: d.getMonth() + 1 };
  carica();
}
function vaiAlMese(data) {
  const [a, m] = data.split("-").map(Number);
  if (a !== mese.value.anno || m !== mese.value.mese) mese.value = { anno: a, mese: m };
}

// ── Portafoglio condiviso ───────────────────────────────────────────────────
const wallet = computed(() => walletStore.selectedWallet);
const condiviso = computed(() => !!wallet.value?.condiviso);
const io = computed(() => walletStore.mioRuolo(wallet.value));
const partner = computed(() => walletStore.partnerDi(wallet.value));
const regola = computed(() => Number(wallet.value?.quotaCreatore ?? 0.5));
const persona = (r) => walletStore.personaDi(wallet.value, r);
const conto = ref([]); // tutti i movimenti del condiviso (conto tra voi, cassa)
async function caricaContoCondiviso() {
  conto.value = condiviso.value ? await caricaConto(walletStore.walletId).catch(() => []) : [];
}
watch(() => walletStore.walletId, caricaContoCondiviso, { immediate: true });
const traVoi = computed(() => bilancio(conto.value, io.value, regola.value));
const fraseConto = (b) =>
  Math.abs(b) < 0.005 ? "Siete in pari" : b > 0 ? `${partner.value?.nome} ti deve ${eur(b)}` : `Devi ${eur(-b)} a ${partner.value?.nome}`;

const movimenti = computed(() => appiattisci(categorie.value));
const tot = computed(() => totali(movimenti.value));
const inCassa = computed(() => saldoCassa(conto.value));
const visibili = computed(() =>
  movimenti.value.filter((m) => filtro.value === "tutti" || (filtro.value === "entrate" ? m.tipo === "entrata" : m.tipo === "uscita")),
);
const sottoRiga = (m) => {
  if (m.tipo === "rimborso") return m.pagatoDa === io.value ? `rimborso a ${partner.value?.nome}` : `rimborso da ${partner.value?.nome}`;
  if (m.tipo === "versamento") return m.pagatoDa === io.value ? "versato in cassa da te" : `versato in cassa da ${partner.value?.nome}`;
  if (!condiviso.value || !m.pagatoDa) return m.cat.Nome + (m.Contanti ? " · contanti" : "");
  const chi = m.pagatoDa === "cassa" ? "cassa" : m.pagatoDa === io.value ? "te" : partner.value?.nome;
  return `${m.cat.Nome} · ${m.pagatoDa === "cassa" ? "dalla cassa" : `${m.tipo === "entrata" ? "ricevuta da" : "pagato da"} ${chi}`}`;
};
const gruppi = computed(() => perGiorno(visibili.value, oggi));

// ── Form ─────────────────────────────────────────────────────────────────────
const vuoto = () => ({
  tipo: ["entrata", "versamento", "salvadanaio"].includes(q.value.tipo) ? q.value.tipo : "uscita",
  pagatoDa: null, // condiviso: ruolo di chi paga (null = io)
  miaQuota: null, // condiviso: la mia parte 0..1 (null = regola del portafoglio)
  importo: "",
  categoriaId: null,
  descrizione: "",
  data: OGGI,
  // nel salvadanaio parte già come versamento mensile (progetto.md §16)
  ricorrente: q.value.ricorrente === "1" || q.value.tipo === "salvadanaio",
  contanti: false,
});
const form = reactive(vuoto());
// "+ Altro": categoria scritta a mano
const altra = reactive({ attivo: false, nome: "", icona: "🏷️", aggiungi: true, emojiAperte: false });
const errori = reactive({ importo: false, categoria: false, altro: "" });
const salvando = ref(false);
const originale = ref(null); // la transazione aperta in modifica
const scansione = ref(false);
const righeLette = ref(null);
const inputFoto = ref(null);
const sezioneForm = ref(null);

const entrata = computed(() => form.tipo === "entrata");
const inSalvadanaio = computed(() => form.tipo === "salvadanaio");

// ── Versamento nel salvadanaio (progetto.md §16) ────────────────────────────
const salv = ref(null); // stato del salvadanaio del portafoglio
const salvForm = reactive({ cartella: q.value.verso || null, fonte: "nuovi", errore: "", erroreCartella: false });
watch(
  () => walletStore.walletId,
  async (id) => (salv.value = id ? await statoSalvadanaio(id).catch(() => null) : null),
  { immediate: true },
);
const salvadanai = computed(() => salv.value?.cartelle.filter((c) => !c.standard) || []);
const cartellaScelta = computed(() => salvadanai.value.find((c) => c.id === salvForm.cartella));
const giaAutomatici = computed(() => salvadanai.value.flatMap((c) => c.automatici.map((a) => ({ ...a, cartella: c }))));
const meseFonte = computed(() => (salv.value ? meseDaCuiPrendere(salv.value.mesi, salv.value.meseCorrente, parseImporto(form.importo) || 0.01) : null));
const nomeDelMese = (k) => `${nomeMese(Number(k.slice(5, 7))).toLowerCase()} ${k.slice(0, 4)}`;
const disponibileDi = (k) => salv.value?.mesi.find((m) => m.mese === k)?.disponibile ?? 0;
const pianoSalv = computed(() => {
  const importo = parseImporto(form.importo);
  const c = cartellaScelta.value;
  if (!inSalvadanaio.value || !(importo > 0) || !c) return null;
  return { ...piano({ importo, saldo: c.saldo, obiettivo: c.obiettivo, ricorrente: form.ricorrente, data: form.data, oggi: OGGI }), importo, c };
});

async function salvaSalvadanaio(importo) {
  salvForm.erroreCartella = !cartellaScelta.value;
  salvForm.errore = "";
  if (salvForm.erroreCartella) return;
  const subito = !form.ricorrente || form.data <= OGGI;
  // una volta sola, da Risparmi mensili: l'ultimo mese chiuso che basta
  const daMese = !form.ricorrente && salvForm.fonte === "mensili" ? meseDaCuiPrendere(salv.value.mesi, salv.value.meseCorrente, importo) : null;
  if (!form.ricorrente && salvForm.fonte === "mensili" && !daMese) {
    salvForm.errore = "Nei Risparmi mensili nessun mese chiuso ha abbastanza soldi";
    return;
  }
  const chi = condiviso.value ? chiPaga.value : null;
  const c = cartellaScelta.value;
  salv.value = form.ricorrente
    ? await attivaVersamentoAutomatico(walletStore.walletId, c.id, { importo, fonte: salvForm.fonte, data: form.data, nota: form.descrizione.trim(), chi })
    : await muoviSalvadanaio(walletStore.walletId, c.id, { importo, nota: form.descrizione.trim(), daMese, chi, data: form.data });
  avviso(
    "success",
    form.ricorrente
      ? `${eur(importo)} ogni mese in ${c.nome}${subito ? " · primo versato oggi" : ` · dal ${Number(form.data.slice(8, 10))} ${nomeMese(Number(form.data.slice(5, 7))).toLowerCase()}`}`
      : `${eur(importo)} in ${c.nome}${daMese ? ` · da ${nomeDelMese(daMese)}` : ""}`,
  );
  if (props.foglio) return emit("salvato", form.data);
  // il form resta su Salvadanaio, pronto per un altro
  Object.assign(form, { importo: "", descrizione: "", data: OGGI, ricorrente: true });
}
const speciale = computed(() => form.tipo === "versamento" || form.tipo === "rimborso");
// Condiviso: chi paga e la mia parte, con i valori predefiniti
const chiPaga = computed(() => form.pagatoDa || io.value);
const quotaMia = computed(() => form.miaQuota ?? miaQuota(null, io.value, regola.value));
const divisioneScelta = computed(() => (quotaMia.value === 0.5 ? "meta" : quotaMia.value === 1 ? "mia" : quotaMia.value === 0 ? "sua" : "altra"));
const personalizzata = ref(false);
const importoAnteprima = computed(() => parseImporto(form.importo) || 0);
const parti = computed(() => {
  const A = importoAnteprima.value;
  const mia = Math.round(A * quotaMia.value * 100) / 100;
  return { mia, sua: Math.round((A - mia) * 100) / 100 };
});
const quotaCreatoreForm = computed(() => (io.value === "creatore" ? quotaMia.value : Math.round((1 - quotaMia.value) * 100) / 100));
// Effetto del movimento sul conto tra voi, dal mio punto di vista
const effettoForm = computed(() => {
  const e = effetto({ tipo: form.tipo, importo: importoAnteprima.value, pagatoDa: chiPaga.value, quota: quotaCreatoreForm.value, quotaCassa: regola.value }, regola.value);
  return io.value === "membro" ? -e : e;
});
const fraseEffetto = computed(() => {
  const e = effettoForm.value;
  if (!importoAnteprima.value || Math.abs(e) < 0.005) return "Il conto tra voi non cambia";
  return e > 0 ? `${partner.value?.nome} ti dovrà ${eur(e)} in più` : `Dovrai ${eur(-e)} in più a ${partner.value?.nome}`;
});
function scegliDivisione(d) {
  personalizzata.value = d === "altra";
  form.miaQuota = d === "meta" ? 0.5 : d === "mia" ? 1 : d === "sua" ? 0 : quotaMia.value;
}
// Le categorie del tipo scelto, senza le nascoste e quelle di sistema
const pillole = computed(() => categorie.value.filter((c) => !c.Nascosta && (c.Tipo || "uscita") === form.tipo));
const titolo = computed(() => inSalvadanaio.value ? "Versa nel salvadanaio" : `${originale.value ? "Modifica" : "Nuovo"} ${form.tipo === "rimborso" ? "rimborso" : form.tipo === "versamento" ? "versamento" : entrata.value ? "entrata" : "uscita"}`.replace("Nuovo entrata", "Nuova entrata").replace("Nuovo uscita", "Nuova uscita"));
// Versamenti e rimborsi vanno sulle categorie di sistema del condiviso
const tipi = computed(() => [
  { id: "uscita", l: "Uscita", i: "ph-arrow-up-right" },
  { id: "entrata", l: "Entrata", i: "ph-arrow-down-left" },
  ...(condiviso.value ? [{ id: "versamento", l: "Versamento", i: "ph-vault" }] : []),
  // il salvadanaio non si apre in modifica da qui: i suoi movimenti stanno nella pagina Salvadanaio
  ...(originale.value ? [] : [{ id: "salvadanaio", l: "Salvadanaio", i: "ph-piggy-bank" }]),
]);
const categoriaSistema = (tipo) => categorie.value.find((c) => c.Tipo === tipo)?.documentId;

function scegliTipo(t) {
  if (form.tipo === t) return;
  const prima = form.tipo;
  form.tipo = t;
  form.categoriaId = null; // la categoria si azzera cambiando tipo
  if (t === "salvadanaio") form.ricorrente = true; // parte già come mensile
  else if (prima === "salvadanaio") form.ricorrente = false;
  if (t === "salvadanaio" && form.pagatoDa === "cassa") form.pagatoDa = null;
  if (t === "versamento" && form.pagatoDa === "cassa") form.pagatoDa = null;
  altra.attivo = false;
  errori.categoria = false;
}
function scegliCategoria(id) {
  form.categoriaId = id;
  altra.attivo = false;
  errori.categoria = false;
}
function apriAltro() {
  altra.attivo = true;
  form.categoriaId = null;
  errori.categoria = false;
}

function svuota() {
  Object.assign(form, vuoto(), { tipo: form.tipo });
  Object.assign(altra, { attivo: false, nome: "", icona: "🏷️", aggiungi: true, emojiAperte: false });
  Object.assign(errori, { importo: false, categoria: false, altro: "" });
  righeLette.value = null;
}

// Apertura in modifica: dalla route, così il link /transazioni/:id funziona ancora.
watch(
  () => props.id,
  async (id) => {
    if (!id) {
      originale.value = null;
      svuota();
      return;
    }
    try {
      const t = await trovaTransazione(id);
      originale.value = t;
      const c = t.categorie;
      Object.assign(form, {
        tipo: ["entrata", "versamento", "rimborso"].includes(c?.Tipo) ? c.Tipo : "uscita",
        pagatoDa: t.pagatoDa || null,
        miaQuota: t.quota == null ? null : miaQuota(t.quota, walletStore.mioRuolo(walletStore.selectedWallet)),
        importo: testoImporto(t.Importo),
        categoriaId: c && !c.Nascosta ? c.documentId : null,
        descrizione: t.Descrizione ?? "",
        data: t.Data,
        ricorrente: !!t.TransazioneRicorrente,
        contanti: !!t.Contanti,
      });
      // Categoria nascosta: si riapre su "Altro" con nome ed emoji compilati
      Object.assign(altra, c?.Nascosta ? { attivo: true, nome: c.Nome, icona: c.icona || "🏷️", aggiungi: false } : { attivo: false, nome: "", icona: "🏷️", aggiungi: true });
      Object.assign(errori, { importo: false, categoria: false, altro: "" });
      if (props.foglio) return;
      vaiAlMese(t.Data);
      await carica();
      if (innerWidth <= 980) sezioneForm.value?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      avviso("error", "Movimento non trovato", erroreLeggibile(e));
      if (props.foglio) emit("chiudi");
      else router.replace("/transazioni");
    }
  },
  { immediate: true },
);

function chiudiModifica() {
  if (props.foglio) return emit("chiudi");
  router.push({ path: "/transazioni", query: {} });
}
function apriMovimento(m) {
  if (telefono.value) return mov.apri({ id: m.documentId });
  if (props.id === m.documentId) return chiudiModifica(); // secondo clic sulla stessa riga
  router.push(`/transazioni/${m.documentId}`);
}
const esc = (e) => e.key === "Escape" && props.id && !props.foglio && chiudiModifica();
onMounted(() => {
  if (props.foglio) return;
  document.addEventListener("keydown", esc);
  // Telefono: /transazioni?tipo=… e /transazioni/:id aprono il foglio sopra lo storico
  if (telefono.value && (props.id || route.query.tipo || route.query.ricorrente)) {
    mov.apri({ id: props.id, tipo: route.query.tipo, verso: route.query.verso, ricorrente: route.query.ricorrente === "1" });
    router.replace({ path: "/transazioni", query: {} });
  }
});
onBeforeUnmount(() => document.removeEventListener("keydown", esc));
// Salvato dal foglio: l'elenco va sul mese del movimento e si ricarica
watch(() => mov.versione, () => {
  if (props.foglio) return;
  if (mov.ultimaData) vaiAlMese(mov.ultimaData);
  carica();
  caricaContoCondiviso();
});

/** La categoria da usare: quella scelta, oppure quella di "+ Altro" (trovata o creata). */
async function categoriaDaUsare() {
  if (speciale.value) {
    const id = categoriaSistema(form.tipo);
    if (!id) throw { campo: "Manca la categoria di sistema del portafoglio condiviso: ricarica la pagina" };
    return id;
  }
  if (!altra.attivo) return form.categoriaId;
  const nome = nomeCategoria(altra.nome);
  if (nome.length < 2) throw { campo: "Scrivi il nome della categoria (almeno 2 caratteri)" };
  const omonima = categoriaOmonima(nome, categorie.value);
  if (omonima) {
    const tipoOmonima = omonima.Tipo || "uscita";
    if (tipoOmonima !== form.tipo) throw { campo: `“${omonima.Nome}” esiste già ${tipoOmonima === "entrata" ? "tra le entrate" : "tra le spese"}` };
    return omonima.documentId; // stesso nome: si usa quella, niente doppioni
  }
  const nuova = await creaCategoria(walletStore.walletId, {
    nome,
    budget: 0,
    icona: altra.icona,
    tipo: form.tipo,
    nascosta: !altra.aggiungi,
  });
  return nuova.documentId;
}

async function salva() {
  const importo = parseImporto(form.importo);
  errori.importo = !(importo > 0);
  if (inSalvadanaio.value) {
    if (errori.importo) return;
    salvando.value = true;
    try {
      await salvaSalvadanaio(importo);
    } catch (e) {
      salvForm.errore = erroreLeggibile(e);
    } finally {
      salvando.value = false;
    }
    return;
  }
  errori.categoria = !speciale.value && !altra.attivo && !form.categoriaId;
  errori.altro = "";
  if (errori.importo || errori.categoria) return;
  salvando.value = true;
  try {
    const categoriaId = await categoriaDaUsare();
    const t = {
      ...form,
      importo,
      categoriaId,
      // Condiviso: chi paga e la quota di chi ha creato il portafoglio
      ...(condiviso.value && { pagatoDa: chiPaga.value, quota: speciale.value ? null : quotaCreatoreForm.value }),
    };
    let id = props.id;
    if (id) await aggiornaTransazione(id, t);
    else id = (await creaTransazione(t)).data.data.documentId;
    if (props.foglio) {
      const cosa = props.id ? "Modifiche salvate"
        : form.tipo === "versamento" ? `Versamento di ${eur(importo)} salvato`
        : `${entrata.value ? "Entrata" : "Uscita"} di ${eur(importo)} salvata`;
      avviso("success", cosa);
      return emit("salvato", form.data);
    }
    vaiAlMese(form.data); // il movimento si sposta nel mese giusto e l'elenco lo segue
    await carica();
    evidenziato.value = id;
    setTimeout(() => evidenziato.value === id && (evidenziato.value = null), 1800);
    if (condiviso.value) await caricaContoCondiviso();
    if (props.id) {
      avviso("success", condiviso.value ? `Modifiche salvate · ${fraseConto(traVoi.value)}` : "Modifiche salvate");
      chiudiModifica();
    } else {
      avviso("success", (form.tipo === "versamento" ? "Versamento salvato" : entrata.value ? "Entrata salvata" : "Uscita salvata") + (condiviso.value ? ` · ${fraseConto(traVoi.value)}` : ""));
      svuota();
    }
  } catch (e) {
    if (e?.campo) errori.altro = e.campo;
    else avviso("error", "Non salvato", erroreLeggibile(e));
  } finally {
    salvando.value = false;
  }
}

function elimina() {
  const t = originale.value;
  confirm.require({
    header: "Eliminare il movimento?",
    message: `${eur(Number(t.Importo))} del ${dataIt(t.Data)}${t.Descrizione ? ` (“${t.Descrizione}”)` : ""}. Non si può annullare.${condiviso.value ? `\n\nSparisce anche per ${partner.value?.nome}.` : ""}`,
    acceptLabel: "Elimina",
    accept: async () => {
      try {
        await eliminaTransazione(t.documentId);
        avviso("success", "Movimento eliminato");
        if (props.foglio) return emit("salvato", t.Data);
        caricaContoCondiviso();
        chiudiModifica();
        await carica();
      } catch (e) {
        avviso("error", "Non eliminato", erroreLeggibile(e));
      }
    },
  });
}

// Foto dello scontrino -> importo e negozio precompilati, da controllare.
async function scansiona(e) {
  const foto = e.target.files[0];
  e.target.value = "";
  if (!foto) return;
  scansione.value = true;
  righeLette.value = null;
  try {
    const dati = await leggiScontrino(foto);
    if (dati.totale != null) form.importo = testoImporto(dati.totale);
    if (dati.descrizione && !form.descrizione) form.descrizione = dati.descrizione;
    if (dati.totale == null) righeLette.value = dati.righeLette ?? [];
    else avviso("success", "Importo letto: controllalo prima di salvare");
  } catch (err) {
    avviso("error", "Scontrino non letto", erroreScontrino(err));
  } finally {
    scansione.value = false;
  }
}

watch(
  () => route.query.verso,
  (v) => !props.foglio && v && (salvForm.cartella = v),
);
watch(
  () => route.query.tipo,
  (t) => !props.foglio && !props.id && ["entrata", "uscita", "versamento", "salvadanaio"].includes(t) && scegliTipo(t),
);
</script>

<template>
  <div>
    <div v-if="!foglio" class="mb-8 sm:mb-10">
      <div class="eyebrow">{{ telefono ? "Storico dei movimenti" : "Registra e consulta" }}</div>
      <h1 class="display">Transazioni</h1>
    </div>

    <div class="grid grid-cols-[minmax(0,1fr)] items-start gap-3" :class="{ 'min-[981px]:grid-cols-[minmax(0,460px)_minmax(0,1fr)]': !foglio }">
      <!-- Foglio del form: prende il colore del tipo -->
      <section
        ref="sezioneForm"
        class="reveal scroll-mt-4 rounded-[20px] px-5 py-6 text-inchiostro transition-colors duration-300 sm:rounded-[28px] sm:p-8"
        v-if="foglio || !telefono"
        :class="[inSalvadanaio ? 'bg-crema' : speciale ? 'bg-pietra' : entrata ? 'bg-salvia' : 'bg-arancio', { 'pt-8!': foglio }]"
        aria-labelledby="titolo-foglio"
      >
        <div v-if="originale || foglio" class="mb-5 flex items-center justify-between gap-3">
          <b v-if="foglio && !originale" class="text-[17px] font-semibold">{{ titolo }}</b>
          <div v-if="originale" class="flex flex-wrap gap-1.5 text-[12.5px] font-semibold">
            <span class="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-inchiostro pr-3 pl-2.5 text-su-inchiostro"><i class="ph-bold ph-pencil-simple" />Modifica</span>
            <span class="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-inchiostro-velo pr-3 pl-2.5"><i class="ph-bold ph-calendar-blank" />{{ dataIt(originale.Data) }}</span>
            <span v-if="condiviso && originale.creatoDa" class="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-inchiostro-velo pr-3 pl-1.5">
              <Avatar :p="persona(originale.creatoDa.id === wallet.membro?.id ? 'membro' : 'creatore')" :size="22" />Inserita da {{ originale.creatoDa.id === walletStore.io?.id ? "te" : partner?.nome }}
            </span>
            <span v-if="condiviso && originale.modificatoDa" class="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-inchiostro-velo pr-3 pl-1.5">
              <Avatar :p="persona(originale.modificatoDa.id === wallet.membro?.id ? 'membro' : 'creatore')" :size="22" />Modificata da {{ originale.modificatoDa.id === walletStore.io?.id ? "te" : partner?.nome }}
            </span>
            <span v-if="originale.TransazioneRicorrente" class="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-inchiostro-velo pr-3 pl-2.5"><i class="ph-bold ph-repeat" />Ogni mese</span>
          </div>
          <button type="button" class="grid h-10 w-10 flex-none place-items-center rounded-full bg-inchiostro-velo text-[17px] hover:bg-inchiostro-linea" :aria-label="foglio ? 'Chiudi' : 'Chiudi la modifica'" @click="chiudiModifica">
            <i class="ph-bold ph-x" />
          </button>
        </div>

        <!-- Quattro tipi (condiviso): due righe da due. Su telefono solo testo. -->
        <div
          v-if="form.tipo !== 'rimborso'"
          class="mb-6 grid gap-1 bg-inchiostro-velo p-1 sm:mb-8"
          :class="tipi.length > 3 ? 'grid-cols-2 rounded-[26px]' : 'auto-cols-fr grid-flow-col rounded-full'"
          role="radiogroup"
          aria-label="Tipo di movimento"
        >
          <button
            v-for="t in tipi"
            :key="t.id"
            type="button"
            role="radio"
            :aria-checked="form.tipo === t.id"
            class="flex h-11 min-w-0 items-center justify-center gap-2 rounded-full px-1 text-[15px] font-semibold whitespace-nowrap transition-colors max-[360px]:text-[13px]"
            :class="{ 'bg-inchiostro text-su-inchiostro': form.tipo === t.id }"
            @click="scegliTipo(t.id)"
          >
            <i class="ph-bold max-[640px]:hidden" :class="t.i" />{{ t.l }}
          </button>
        </div>

        <h2 id="titolo-foglio" :class="{ 'sr-only': foglio }" class="mb-6 text-[28px] leading-[1.05] font-medium tracking-[-0.04em] sm:mb-8 sm:text-[34px]">{{ titolo }}</h2>

        <form class="flex flex-col gap-6" novalidate @submit.prevent="salva">
          <div>
            <label class="mb-2.5 block text-sm font-semibold" for="imp">Importo</label>
            <div class="flex items-baseline gap-1.5 border-b-2 border-inchiostro pb-1.5 focus-within:border-b-[3px] focus-within:pb-[5px]">
              <span class="text-[40px] tracking-[-0.04em]">€</span>
              <input
                id="imp"
                v-model="form.importo"
                inputmode="decimal"
                placeholder="0,00"
                autocomplete="off"
                class="num w-full min-w-0 flex-1 bg-transparent text-[44px] leading-none tracking-[-0.05em] text-inchiostro outline-none placeholder:text-inchiostro/35 sm:text-[56px]"
                :aria-invalid="errori.importo"
              />
            </div>
            <p v-if="errori.importo" class="mt-2 flex items-center gap-1.5 text-[13px] font-semibold"><i class="ph-bold ph-warning-circle" />Inserisci un importo maggiore di zero</p>
          </div>

          <!-- Versamento nel salvadanaio -->
          <template v-if="inSalvadanaio">
            <div>
              <span id="pig-l" class="mb-2.5 block text-sm font-semibold">In quale salvadanaio</span>
              <div v-if="salvadanai.length" class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="pig-l">
                <button
                  v-for="c in salvadanai"
                  :key="c.id"
                  type="button"
                  role="radio"
                  :aria-checked="salvForm.cartella === c.id"
                  class="inline-flex h-[42px] max-w-full items-center gap-2 rounded-full pr-4 pl-2.5 text-[14.5px] font-medium shadow-[inset_0_0_0_1.5px_var(--color-inchiostro-linea)] hover:shadow-[inset_0_0_0_1.5px_var(--color-inchiostro)]"
                  :class="{ 'bg-inchiostro text-su-inchiostro shadow-none!': salvForm.cartella === c.id }"
                  @click="(salvForm.cartella = c.id), (salvForm.erroreCartella = false)"
                >
                  <Emoji :e="c.emoji || '🐷'" class="h-[22px]! w-[22px]!" /><span class="truncate">{{ c.nome }}</span>
                </button>
              </div>
              <p v-else class="flex items-start gap-1.5 text-[13px]">
                <i class="ph-bold ph-info mt-0.5" /><span>Non hai ancora salvadanai. <router-link to="/risparmio" class="font-semibold underline underline-offset-2">Creane uno</router-link>, poi torna qui.</span>
              </p>
              <p v-if="salvForm.erroreCartella" class="mt-2 flex items-center gap-1.5 text-[13px] font-semibold"><i class="ph-bold ph-warning-circle" />Scegli un salvadanaio</p>
              <div v-if="giaAutomatici.length" class="mt-4 rounded-[20px] bg-inchiostro-velo px-4 py-3">
                <div class="mb-1 flex items-center justify-between text-[13px] font-semibold">
                  <span>Già in automatico</span><router-link to="/impostazioni#ricorrenti" class="underline underline-offset-2">Gestisci</router-link>
                </div>
                <div v-for="a in giaAutomatici" :key="a.id" class="flex items-center gap-2.5 py-1.5" :class="{ 'opacity-55': a.inPausa }">
                  <Emoji :e="a.cartella.emoji || '🐷'" class="h-5! w-5! flex-none" />
                  <span class="min-w-0 text-[13px]"><b class="font-semibold">{{ a.cartella.nome }}</b> · {{ eur(a.importo) }} il {{ a.giorno }} di ogni mese<template v-if="a.inPausa"> · in pausa</template></span>
                </div>
              </div>
            </div>
            <div>
              <span id="fonte-l" class="mb-2.5 block text-sm font-semibold">Da dove arrivano i soldi</span>
              <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="fonte-l">
                <button
                  v-for="f in [{ id: 'nuovi', l: 'Soldi nuovi' }, { id: 'mensili', l: 'Risparmi mensili' }]"
                  :key="f.id"
                  type="button"
                  role="radio"
                  :aria-checked="salvForm.fonte === f.id"
                  class="h-[42px] rounded-full px-4 text-sm font-medium shadow-[inset_0_0_0_1.5px_var(--color-inchiostro-linea)]"
                  :class="{ 'bg-inchiostro text-su-inchiostro shadow-none!': salvForm.fonte === f.id }"
                  @click="(salvForm.fonte = f.id), (salvForm.errore = '')"
                >
                  {{ f.l }}
                </button>
              </div>
              <p class="mt-2.5 flex items-start gap-1.5 text-[13px]">
                <i class="ph-bold ph-info mt-0.5" />
                <span v-if="salvForm.fonte === 'nuovi'">Si aggiungono al totale risparmiato.</span>
                <span v-else-if="form.ricorrente">Ogni mese li prende dai Risparmi mensili dell'ultimo mese chiuso. Il totale non cambia.</span>
                <span v-else-if="meseFonte">Escono da {{ nomeDelMese(meseFonte) }}, dove ci sono {{ eur(disponibileDi(meseFonte)) }} disponibili. Il totale non cambia.</span>
                <span v-else>Nei Risparmi mensili non c'è un mese chiuso con abbastanza soldi.</span>
              </p>
              <p v-if="salvForm.errore" class="mt-2 flex items-center gap-1.5 text-[13px] font-semibold"><i class="ph-bold ph-warning-circle" />{{ salvForm.errore }}</p>
            </div>
          </template>

          <div v-if="!speciale && !inSalvadanaio">
            <span id="cat-l" class="mb-2.5 block text-sm font-semibold">Categoria</span>
            <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="cat-l">
              <button
                v-for="c in pillole"
                :key="c.documentId"
                type="button"
                role="radio"
                :aria-checked="!altra.attivo && form.categoriaId === c.documentId"
                class="inline-flex h-[42px] max-w-full items-center gap-2 rounded-full pr-4 pl-2.5 text-[14.5px] font-medium shadow-[inset_0_0_0_1.5px_var(--color-inchiostro-linea)] hover:shadow-[inset_0_0_0_1.5px_var(--color-inchiostro)]"
                :class="{ 'bg-inchiostro text-su-inchiostro shadow-none!': !altra.attivo && form.categoriaId === c.documentId }"
                @click="scegliCategoria(c.documentId)"
              >
                <Emoji :e="c.icona || '🏷️'" class="h-[22px]! w-[22px]!" /><span class="truncate">{{ c.Nome }}</span>
              </button>
              <button
                type="button"
                role="radio"
                :aria-checked="altra.attivo"
                class="inline-flex h-[42px] items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-inchiostro-linea pr-4 pl-3 text-[14.5px] font-medium hover:border-inchiostro"
                :class="{ 'border-transparent! bg-inchiostro text-su-inchiostro': altra.attivo }"
                @click="apriAltro"
              >
                <i class="ph-bold ph-plus text-[15px]" />Altro
              </button>
            </div>
            <p v-if="errori.categoria" class="mt-2 flex items-center gap-1.5 text-[13px] font-semibold"><i class="ph-bold ph-warning-circle" />Scegli una categoria</p>

            <div v-if="altra.attivo" class="mt-4 flex flex-col gap-3 rounded-[20px] bg-inchiostro-velo p-4">
              <label class="text-sm font-semibold" for="altro-nome">Nuova categoria</label>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="grid h-[52px] w-[52px] flex-none place-items-center rounded-full bg-inchiostro-velo text-2xl hover:shadow-[inset_0_0_0_2px_var(--color-inchiostro)]"
                  :aria-expanded="altra.emojiAperte"
                  aria-label="Scegli l'emoji"
                  @click="altra.emojiAperte = !altra.emojiAperte"
                >
                  <Emoji :e="altra.icona" />
                </button>
                <input id="altro-nome" v-model="altra.nome" maxlength="30" placeholder="Es. Farmacia" autocomplete="off" class="h-[52px] min-w-0 flex-1 rounded-full bg-inchiostro-velo px-5 text-inchiostro outline-none placeholder:text-inchiostro/55 focus:shadow-[inset_0_0_0_2px_var(--color-inchiostro)]" />
              </div>
              <!-- chiusa da sola quando si sceglie: si torna al nome -->
              <SceltaEmoji v-if="altra.emojiAperte" v-model="altra.icona" su-blocco @update:modelValue="altra.emojiAperte = false" />
              <p v-if="errori.altro" class="flex items-center gap-1.5 text-[13px] font-semibold"><i class="ph-bold ph-warning-circle" />{{ errori.altro }}</p>
              <label class="flex cursor-pointer items-center justify-between gap-4 border-t border-inchiostro-velo pt-3">
                <span>
                  <b class="block text-sm font-semibold">Aggiungi alle mie categorie</b>
                  <small class="text-[12.5px]">{{ altra.aggiungi ? "La ritrovi qui tra le pillole e in Impostazioni" : "Vale solo per questo movimento (resta nei report)" }}</small>
                </span>
                <Interruttore v-model="altra.aggiungi" class="sul-blocco" />
              </label>
            </div>
          </div>

          <!-- Condiviso: chi paga e come si divide -->
          <div v-if="condiviso">
            <span id="chi-l" class="mb-2.5 block text-sm font-semibold">{{ form.tipo === "rimborso" ? "Chi ha dato i soldi" : form.tipo === "versamento" || inSalvadanaio ? "Chi versa" : entrata ? "Ricevuta da" : "Pagato da" }}</span>
            <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="chi-l">
              <button
                v-for="r in speciale || inSalvadanaio ? [io, altro(io)] : [io, altro(io), 'cassa']"
                :key="r"
                type="button"
                role="radio"
                :aria-checked="chiPaga === r"
                class="inline-flex h-11 items-center gap-2 rounded-full pr-4 pl-2 text-[14.5px] font-medium shadow-[inset_0_0_0_1.5px_var(--color-inchiostro-linea)] hover:shadow-[inset_0_0_0_1.5px_var(--color-inchiostro)]"
                :class="{ 'bg-inchiostro text-su-inchiostro shadow-none!': chiPaga === r }"
                @click="form.pagatoDa = r"
              >
                <Avatar :p="persona(r)" :size="28" />{{ r === "cassa" ? "Cassa comune" : r === io ? "Io" : partner?.nome }}
              </button>
            </div>
          </div>
          <div v-if="condiviso && !speciale && !inSalvadanaio">
            <span id="div-l" class="mb-2.5 block text-sm font-semibold">Divisione</span>
            <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="div-l">
              <button
                v-for="d in [{ id: 'meta', l: 'A metà' }, { id: 'mia', l: 'Tutta mia' }, { id: 'sua', l: 'Tutta sua' }, { id: 'altra', l: 'Personalizzata' }]"
                :key="d.id"
                type="button"
                role="radio"
                :aria-checked="personalizzata ? d.id === 'altra' : divisioneScelta === d.id"
                class="h-[42px] rounded-full px-4 text-sm font-medium shadow-[inset_0_0_0_1.5px_var(--color-inchiostro-linea)]"
                :class="{ 'bg-inchiostro text-su-inchiostro shadow-none!': personalizzata ? d.id === 'altra' : divisioneScelta === d.id }"
                @click="scegliDivisione(d.id)"
              >
                {{ d.l }}
              </button>
            </div>
            <div v-if="personalizzata || divisioneScelta === 'altra'" class="mt-4">
              <input :value="Math.round(quotaMia * 100)" type="range" min="0" max="100" step="5" class="w-full accent-[var(--color-inchiostro)]" aria-label="La tua parte in percentuale" @input="form.miaQuota = Number($event.target.value) / 100" />
              <div class="mt-1 flex justify-between text-[13px] font-semibold"><span>Tu {{ Math.round(quotaMia * 100) }}%</span><span>{{ partner?.nome }} {{ 100 - Math.round(quotaMia * 100) }}%</span></div>
            </div>
            <div class="mt-4 flex flex-col gap-2.5 rounded-[20px] bg-inchiostro-velo px-5 py-4">
              <div class="flex flex-wrap justify-between gap-x-3 gap-y-1.5 text-sm">
                <span class="inline-flex items-center gap-2"><Avatar :p="walletStore.io" :size="22" />Tu <b class="num font-semibold">{{ eur(parti.mia) }}</b></span>
                <span class="inline-flex items-center gap-2"><Avatar :p="partner" :size="22" />{{ partner?.nome }} <b class="num font-semibold">{{ eur(parti.sua) }}</b></span>
              </div>
              <div class="bar bg-inchiostro-velo!"><span class="bg-inchiostro!" :style="{ width: `${quotaMia * 100}%` }" /></div>
              <div class="flex items-center gap-1.5 border-t border-inchiostro-velo pt-2.5 text-[13.5px]"><i class="ph-bold ph-scales" />{{ fraseEffetto }}</div>
            </div>
          </div>

          <div>
            <label class="mb-2.5 block text-sm font-semibold" for="desc">{{ inSalvadanaio ? "Nota" : "Descrizione" }}</label>
            <input id="desc" v-model="form.descrizione" placeholder="Es. Pieno Eni" autocomplete="off" class="h-[52px] w-full rounded-full bg-inchiostro-velo px-5 text-inchiostro outline-none placeholder:text-inchiostro/55 focus:shadow-[inset_0_0_0_2px_var(--color-inchiostro)]" />
          </div>

          <div>
            <span id="data-l" class="mb-2.5 block text-sm font-semibold">Data</span>
            <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="data-l">
              <button
                v-for="d in [{ v: OGGI, l: 'Oggi' }, { v: IERI, l: 'Ieri' }]"
                :key="d.v"
                type="button"
                role="radio"
                :aria-checked="form.data === d.v"
                class="h-[42px] rounded-full px-4 text-sm font-medium shadow-[inset_0_0_0_1.5px_var(--color-inchiostro-linea)]"
                :class="{ 'bg-inchiostro text-su-inchiostro shadow-none!': form.data === d.v }"
                @click="form.data = d.v"
              >
                {{ d.l }}
              </button>
              <input v-model="form.data" type="date" required aria-label="Altra data" class="h-[42px] min-w-[150px] flex-1 rounded-full bg-inchiostro-velo px-4 text-sm text-inchiostro outline-none [color-scheme:light]" />
            </div>
          </div>

          <div v-if="!speciale" class="flex flex-col rounded-[20px] bg-inchiostro-velo">
            <label class="flex cursor-pointer items-center justify-between gap-4 px-5 py-3.5">
              <span v-if="inSalvadanaio"><b class="block text-[14.5px] font-semibold">Ogni mese, in automatico</b><small class="text-[13px]">Si ripete il giorno della data scelta, finché non lo fermi</small></span>
              <span v-else><b class="block text-[14.5px] font-semibold">Ricorrente</b><small class="text-[13px]">Si ripete ogni mese lo stesso giorno</small></span>
              <Interruttore v-model="form.ricorrente" class="sul-blocco" />
            </label>
            <label v-if="!inSalvadanaio" class="flex cursor-pointer items-center justify-between gap-4 border-t border-inchiostro-velo px-5 py-3.5">
              <span>
                <b class="block text-[14.5px] font-semibold">{{ entrata ? "Ricevuta in contanti" : "Pagata in contanti" }}</b>
                <small class="text-[13px]">Esclusa dal confronto con l'estratto conto</small>
              </span>
              <Interruttore v-model="form.contanti" class="sul-blocco" />
            </label>
          </div>

          <!-- Piano del versamento nel salvadanaio, aggiornato mentre si scrive -->
          <div v-if="inSalvadanaio" class="flex flex-col gap-2.5 rounded-[20px] bg-inchiostro-velo px-5 py-4 text-[13.5px]">
            <p v-if="!pianoSalv" class="flex items-center gap-1.5"><i class="ph-bold ph-info" />Scegli importo e salvadanaio per vedere il piano</p>
            <template v-else>
              <div class="flex items-center gap-3">
                <span class="grid h-10 w-10 flex-none place-items-center rounded-full bg-inchiostro-velo text-xl"><Emoji :e="pianoSalv.c.emoji || '🐷'" /></span>
                <span class="min-w-0">
                  <b class="num block text-[15px] font-semibold">{{ eur(pianoSalv.importo) }} {{ form.ricorrente ? "ogni mese" : "una volta" }}</b>
                  <small class="block text-[13px]">
                    {{ form.ricorrente ? `il ${pianoSalv.giorno} del mese in ${pianoSalv.c.nome}` : `in ${pianoSalv.c.nome}` }} · primo
                    {{ pianoSalv.primoOggi ? "oggi" : `il ${pianoSalv.giorno} ${nomeMese(Number(form.data.slice(5, 7))).slice(0, 3).toLowerCase()}` }}
                  </small>
                </span>
              </div>
              <div v-if="pianoSalv.percentuale !== null" class="bar bg-inchiostro-velo!"><span class="bg-inchiostro!" :style="{ width: `${pianoSalv.percentuale}%` }" /></div>
              <div class="flex flex-wrap justify-between gap-x-3 font-semibold">
                <template v-if="pianoSalv.raggiunto"><span>Obiettivo già raggiunto</span><span>{{ eur(pianoSalv.c.saldo, { corto: true }) }} di {{ eur(pianoSalv.c.obiettivo, { corto: true }) }}</span></template>
                <template v-else-if="pianoSalv.arrivo"><span>Arrivi a {{ eur(pianoSalv.c.obiettivo, { corto: true }) }} a {{ pianoSalv.arrivo }}</span><span>{{ pianoSalv.versamenti }} {{ pianoSalv.versamenti === 1 ? "versamento" : "versamenti" }}</span></template>
                <template v-else-if="pianoSalv.c.obiettivo"><span>Dopo: {{ eur(pianoSalv.dopo, { corto: true }) }} di {{ eur(pianoSalv.c.obiettivo, { corto: true }) }}</span><span>{{ Math.round(pianoSalv.percentuale) }}%</span></template>
                <template v-else-if="pianoSalv.inUnAnno !== null"><span>Senza obiettivo</span><span>{{ eur(pianoSalv.inUnAnno, { corto: true }) }} in un anno</span></template>
              </div>
              <p v-if="pianoSalv.meseCorto" class="flex items-center gap-1.5 border-t border-inchiostro-velo pt-2.5"><i class="ph-bold ph-calendar-blank" />Nei mesi più corti si versa l'ultimo giorno del mese</p>
            </template>
          </div>

          <!-- scontrino: solo per le uscite -->
          <div v-if="form.tipo === 'uscita' && !originale">
            <!-- capture: sul telefono apre subito la fotocamera posteriore (lo scontrino si fotografa, non si cerca in galleria) -->
            <input ref="inputFoto" type="file" accept="image/*" capture="environment" class="hidden" @change="scansiona" />
            <button
              type="button"
              class="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[14.5px] font-medium shadow-[inset_0_0_0_1.5px_var(--color-inchiostro-linea)] hover:shadow-[inset_0_0_0_1.5px_var(--color-inchiostro)] disabled:opacity-60"
              :disabled="scansione"
              @click="inputFoto.click()"
            >
              <i class="ph-bold" :class="scansione ? 'ph-circle-notch animate-spin' : 'ph-scan'" />{{ scansione ? "Leggo lo scontrino…" : "Scansiona scontrino" }}
            </button>
            <p class="mt-2 text-[12.5px]">La foto viene letta sul server e cancellata subito dopo.</p>
            <div v-if="righeLette" class="mt-3 rounded-[14px] bg-inchiostro-velo p-3 text-sm">
              <p>Totale non riconosciuto, scrivilo a mano.</p>
              <details class="mt-2">
                <summary class="cursor-pointer">Cosa ho letto</summary>
                <p v-if="!righeLette.length" class="mt-2 text-xs">Nessun testo riconosciuto: rifai la foto con più luce.</p>
                <pre v-else class="mt-2 text-xs whitespace-pre-wrap">{{ righeLette.join("\n") }}</pre>
              </details>
            </div>
          </div>

          <div class="mt-2 flex items-center gap-3">
            <button type="submit" class="pill-btn pill-btn--ink h-[60px]! flex-1 text-base" :disabled="salvando || !walletStore.walletId">
              {{ salvando ? "Salvo…" : originale ? "Salva modifiche" : inSalvadanaio ? (form.ricorrente ? "Attiva versamento mensile" : "Versa nel salvadanaio") : form.tipo === "versamento" ? "Salva versamento" : entrata ? "Salva entrata" : "Salva uscita" }}
            </button>
            <button type="button" class="h-[60px] px-4 text-[14.5px] font-semibold underline underline-offset-4" @click="originale || foglio ? chiudiModifica() : svuota()">
              {{ originale || foglio ? "Annulla" : "Svuota" }}
            </button>
          </div>
          <button v-if="originale" type="button" class="-mt-1.5 flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold hover:bg-inchiostro-velo" @click="elimina">
            <i class="ph-bold ph-trash" />Elimina movimento
          </button>
        </form>
      </section>

      <!-- Elenco del mese -->
      <section v-if="!foglio" class="panel reveal" style="--i: 1" aria-label="Movimenti del mese">
        <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
          <MeseNav v-model="mese" @sposta="sposta" />
          <div class="seg" role="group" aria-label="Filtra i movimenti">
            <button :aria-pressed="filtro === 'tutti'" @click="filtro = 'tutti'">Tutti</button>
            <button :aria-pressed="filtro === 'entrate'" @click="filtro = 'entrate'">Entrate</button>
            <button :aria-pressed="filtro === 'uscite'" @click="filtro = 'uscite'">Uscite</button>
          </div>
        </div>
        <div class="mb-6 grid grid-cols-3 gap-1.5 sm:gap-2">
          <div v-for="b in [{ l: 'Entrate', v: tot.entrate, c: 'bg-salvia' }, { l: 'Uscite', v: tot.uscite, c: 'bg-arancio' }, condiviso ? { l: 'In cassa', v: inCassa, c: 'bg-crema' } : { l: 'Saldo', v: tot.saldo, c: 'bg-crema' }]" :key="b.l" class="min-w-0 rounded-[20px] px-3 py-3 text-inchiostro sm:px-5 sm:py-4" :class="b.c">
            <small class="text-[13px] font-medium">{{ b.l }}</small>
            <b class="mt-3 block truncate text-[clamp(15px,4.4vw,18px)] leading-none font-normal sm:text-2xl"><Euro :v="b.v" /></b>
          </div>
        </div>

        <div v-if="condiviso" class="-mt-2 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-campo px-5 py-4 text-sm">
          <span class="flex items-center gap-3">
            <span class="flex"><Avatar :p="walletStore.io" :size="28" /><Avatar :p="partner" :size="28" class="-ml-[7px] ring-2 ring-campo" /></span>
            <b class="font-medium">{{ fraseConto(traVoi) }}</b>
          </span>
          <router-link v-if="Math.abs(traVoi) >= 0.005" to="/" class="text-[13.5px] font-medium text-testo2 underline underline-offset-[3px]">Salda in Home</router-link>
        </div>
        <div v-if="errore" class="box-errore">{{ errore }}</div>
        <template v-else-if="loading && !movimenti.length">
          <Skeleton v-for="i in 5" :key="i" height="3.5rem" borderRadius="16px" class="mb-2" />
        </template>
        <p v-else-if="!gruppi.length" class="vuoto">
          {{ movimenti.length ? "Nessun movimento con questo filtro." : "Nessun movimento in questo mese." }}
        </p>
        <div v-else :class="{ 'opacity-60': loading }">
          <div v-for="g in gruppi" :key="g.data">
            <div class="pt-5 pb-2 text-[12.5px] font-medium text-testo2 first:pt-0">{{ g.etichetta }}</div>
            <button
              v-for="m in g.movimenti"
              :key="m.documentId"
              type="button"
              class="group -mx-3 flex w-[calc(100%+24px)] items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-campo"
              :class="{ 'bg-campo shadow-[inset_0_0_0_1.5px_var(--color-anello)]': props.id === m.documentId, lampo: evidenziato === m.documentId }"
              :aria-current="props.id === m.documentId"
              @click="apriMovimento(m)"
            >
              <span class="relative grid h-11 w-11 flex-none place-items-center rounded-full bg-campo text-[22px] group-hover:bg-card">
                <Emoji :e="m.cat.icona || '🏷️'" />
                <Avatar v-if="condiviso && m.pagatoDa" :p="persona(m.pagatoDa)" :size="22" class="absolute -right-1 -bottom-1 ring-2 ring-card" />
              </span>
              <span class="min-w-0 flex-1">
                <b class="block truncate text-[15px] font-medium">
                  {{ m.Descrizione || m.cat.Nome }}
                  <span v-if="m.TransazioneRicorrente" class="ml-2 text-[11.5px] font-normal text-testo2"><i class="ph-bold ph-repeat" /> ogni mese</span>
                </b>
                <small class="block truncate text-[13px] text-testo2">{{ sottoRiga(m) }}</small>
              </span>
              <span class="num font-medium whitespace-nowrap" :class="m.tipo === 'entrata' ? 'text-fg-positivo' : m.tipo === 'uscita' ? 'text-fg-negativo' : 'text-testo2'">
                {{ m.tipo === "entrata" || m.tipo === "uscita" ? eur(m.tipo === "entrata" ? m.importo : -m.importo, { segno: true }) : eur(m.importo) }}
              </span>
              <i class="ph-bold ph-caret-right -translate-x-1 text-[15px] text-testo3 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" :class="{ 'translate-x-0 text-fg-accento! opacity-100': props.id === m.documentId }" />
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Interruttori sui blocchi colorati: pista nera, pallino chiaro */
.sul-blocco :deep(input + span) { background: var(--color-inchiostro-linea); }
.sul-blocco :deep(input:checked + span) { background: var(--color-inchiostro); }
.sul-blocco :deep(input:checked + span)::after { background: var(--color-pomello); }
.lampo { animation: lampo 1.8s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes lampo { from { background: color-mix(in srgb, var(--color-crema) 28%, transparent); } to { background: transparent; } }
</style>

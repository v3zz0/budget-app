<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import { caricaMese } from "@/services/dashboard.js";
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
import { EMOJI } from "@/components/SceltaEmoji.vue";

// id presente (dalla route) = modifica nello stesso foglio, assente = nuova
const props = defineProps({ id: { type: String, default: null } });

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const toast = useToast();
const walletStore = useWalletStore();
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

const movimenti = computed(() => appiattisci(categorie.value));
const tot = computed(() => totali(movimenti.value));
const visibili = computed(() =>
  movimenti.value.filter((m) => filtro.value === "tutti" || (filtro.value === "entrate" ? m.tipo === "entrata" : m.tipo === "uscita")),
);
const gruppi = computed(() => perGiorno(visibili.value, oggi));

// ── Form ─────────────────────────────────────────────────────────────────────
const vuoto = () => ({
  tipo: route.query.tipo === "entrata" ? "entrata" : "uscita",
  importo: "",
  categoriaId: null,
  descrizione: "",
  data: OGGI,
  ricorrente: route.query.ricorrente === "1",
  contanti: false,
});
const form = reactive(vuoto());
// "+ Altro": categoria scritta a mano
const altro = reactive({ attivo: false, nome: "", icona: "🏷️", aggiungi: true, emojiAperte: false });
const errori = reactive({ importo: false, categoria: false, altro: "" });
const salvando = ref(false);
const originale = ref(null); // la transazione aperta in modifica
const scansione = ref(false);
const righeLette = ref(null);
const inputFoto = ref(null);
const foglio = ref(null);

const entrata = computed(() => form.tipo === "entrata");
// Le categorie del tipo scelto, senza le nascoste e quelle di sistema
const pillole = computed(() => categorie.value.filter((c) => !c.Nascosta && (c.Tipo || "uscita") === form.tipo));
const titolo = computed(() => `${originale.value ? "Modifica" : "Nuova"} ${entrata.value ? "entrata" : "uscita"}`);

function scegliTipo(t) {
  if (form.tipo === t) return;
  form.tipo = t;
  form.categoriaId = null; // la categoria si azzera cambiando tipo
  altro.attivo = false;
  errori.categoria = false;
}
function scegliCategoria(id) {
  form.categoriaId = id;
  altro.attivo = false;
  errori.categoria = false;
}
function apriAltro() {
  altro.attivo = true;
  form.categoriaId = null;
  errori.categoria = false;
}

function svuota() {
  Object.assign(form, vuoto(), { tipo: form.tipo });
  Object.assign(altro, { attivo: false, nome: "", icona: "🏷️", aggiungi: true, emojiAperte: false });
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
        tipo: c?.Tipo === "entrata" ? "entrata" : "uscita",
        importo: testoImporto(t.Importo),
        categoriaId: c && !c.Nascosta ? c.documentId : null,
        descrizione: t.Descrizione ?? "",
        data: t.Data,
        ricorrente: !!t.TransazioneRicorrente,
        contanti: !!t.Contanti,
      });
      // Categoria nascosta: si riapre su "Altro" con nome ed emoji compilati
      Object.assign(altro, c?.Nascosta ? { attivo: true, nome: c.Nome, icona: c.icona || "🏷️", aggiungi: false } : { attivo: false, nome: "", icona: "🏷️", aggiungi: true });
      Object.assign(errori, { importo: false, categoria: false, altro: "" });
      vaiAlMese(t.Data);
      await carica();
      if (innerWidth <= 980) foglio.value?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      avviso("error", "Movimento non trovato", erroreLeggibile(e));
      router.replace("/transazioni");
    }
  },
  { immediate: true },
);

function chiudiModifica() {
  router.push({ path: "/transazioni", query: {} });
}
function apriMovimento(m) {
  if (props.id === m.documentId) return chiudiModifica(); // secondo clic sulla stessa riga
  router.push(`/transazioni/${m.documentId}`);
}
const esc = (e) => e.key === "Escape" && props.id && chiudiModifica();
onMounted(() => document.addEventListener("keydown", esc));
onBeforeUnmount(() => document.removeEventListener("keydown", esc));

/** La categoria da usare: quella scelta, oppure quella di "+ Altro" (trovata o creata). */
async function categoriaDaUsare() {
  if (!altro.attivo) return form.categoriaId;
  const nome = nomeCategoria(altro.nome);
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
    icona: altro.icona,
    tipo: form.tipo,
    nascosta: !altro.aggiungi,
  });
  return nuova.documentId;
}

async function salva() {
  const importo = parseImporto(form.importo);
  errori.importo = !(importo > 0);
  errori.categoria = !altro.attivo && !form.categoriaId;
  errori.altro = "";
  if (errori.importo || errori.categoria) return;
  salvando.value = true;
  try {
    const categoriaId = await categoriaDaUsare();
    const t = { ...form, importo, categoriaId };
    let id = props.id;
    if (id) await aggiornaTransazione(id, t);
    else id = (await creaTransazione(t)).data.data.documentId;
    vaiAlMese(form.data); // il movimento si sposta nel mese giusto e l'elenco lo segue
    await carica();
    evidenziato.value = id;
    setTimeout(() => evidenziato.value === id && (evidenziato.value = null), 1800);
    if (props.id) {
      avviso("success", "Modifiche salvate");
      chiudiModifica();
    } else {
      avviso("success", entrata.value ? "Entrata salvata" : "Uscita salvata");
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
    message: `${eur(Number(t.Importo))} del ${dataIt(t.Data)}${t.Descrizione ? ` (“${t.Descrizione}”)` : ""}. Non si può annullare.`,
    acceptLabel: "Elimina",
    accept: async () => {
      try {
        await eliminaTransazione(t.documentId);
        avviso("success", "Movimento eliminato");
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
  () => route.query.tipo,
  (t) => !props.id && (t === "entrata" || t === "uscita") && scegliTipo(t),
);
</script>

<template>
  <div>
    <div class="mb-8 sm:mb-10">
      <div class="eyebrow">Registra e consulta</div>
      <h1 class="display">Transazioni</h1>
    </div>

    <div class="grid grid-cols-[minmax(0,1fr)] items-start gap-3 min-[981px]:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <!-- Foglio del form: prende il colore del tipo -->
      <section
        ref="foglio"
        class="reveal scroll-mt-4 rounded-[20px] px-5 py-6 text-inchiostro transition-colors duration-300 sm:rounded-[28px] sm:p-8"
        :class="entrata ? 'bg-salvia' : 'bg-arancio'"
        aria-labelledby="titolo-foglio"
      >
        <div v-if="originale" class="mb-5 flex items-center justify-between gap-3">
          <div class="flex flex-wrap gap-1.5 text-[12.5px] font-semibold">
            <span class="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-inchiostro pr-3 pl-2.5 text-su-inchiostro"><i class="ph-bold ph-pencil-simple" />Modifica</span>
            <span class="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-inchiostro-velo pr-3 pl-2.5"><i class="ph-bold ph-calendar-blank" />{{ dataIt(originale.Data) }}</span>
            <span v-if="originale.TransazioneRicorrente" class="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-inchiostro-velo pr-3 pl-2.5"><i class="ph-bold ph-repeat" />Ogni mese</span>
          </div>
          <button type="button" class="grid h-10 w-10 flex-none place-items-center rounded-full bg-inchiostro-velo text-[17px] hover:bg-inchiostro-linea" aria-label="Chiudi la modifica" @click="chiudiModifica">
            <i class="ph-bold ph-x" />
          </button>
        </div>

        <div class="mb-6 grid auto-cols-fr grid-flow-col rounded-full bg-inchiostro-velo p-1 sm:mb-8" role="radiogroup" aria-label="Tipo di movimento">
          <button
            v-for="t in [{ id: 'uscita', l: 'Uscita', i: 'ph-arrow-up-right' }, { id: 'entrata', l: 'Entrata', i: 'ph-arrow-down-left' }]"
            :key="t.id"
            type="button"
            role="radio"
            :aria-checked="form.tipo === t.id"
            class="flex h-11 items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-colors"
            :class="{ 'bg-inchiostro text-su-inchiostro': form.tipo === t.id }"
            @click="scegliTipo(t.id)"
          >
            <i class="ph-bold" :class="t.i" />{{ t.l }}
          </button>
        </div>

        <h2 id="titolo-foglio" class="mb-6 text-[28px] leading-[1.05] font-medium tracking-[-0.04em] sm:mb-8 sm:text-[34px]">{{ titolo }}</h2>

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

          <div>
            <span id="cat-l" class="mb-2.5 block text-sm font-semibold">Categoria</span>
            <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="cat-l">
              <button
                v-for="c in pillole"
                :key="c.documentId"
                type="button"
                role="radio"
                :aria-checked="!altro.attivo && form.categoriaId === c.documentId"
                class="inline-flex h-[42px] max-w-full items-center gap-2 rounded-full pr-4 pl-2.5 text-[14.5px] font-medium shadow-[inset_0_0_0_1.5px_var(--color-inchiostro-linea)] hover:shadow-[inset_0_0_0_1.5px_var(--color-inchiostro)]"
                :class="{ 'bg-inchiostro text-su-inchiostro shadow-none!': !altro.attivo && form.categoriaId === c.documentId }"
                @click="scegliCategoria(c.documentId)"
              >
                <Emoji :e="c.icona || '🏷️'" class="h-[22px]! w-[22px]!" /><span class="truncate">{{ c.Nome }}</span>
              </button>
              <button
                type="button"
                role="radio"
                :aria-checked="altro.attivo"
                class="inline-flex h-[42px] items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-inchiostro-linea pr-4 pl-3 text-[14.5px] font-medium hover:border-inchiostro"
                :class="{ 'border-transparent! bg-inchiostro text-su-inchiostro': altro.attivo }"
                @click="apriAltro"
              >
                <i class="ph-bold ph-plus text-[15px]" />Altro
              </button>
            </div>
            <p v-if="errori.categoria" class="mt-2 flex items-center gap-1.5 text-[13px] font-semibold"><i class="ph-bold ph-warning-circle" />Scegli una categoria</p>

            <div v-if="altro.attivo" class="mt-4 flex flex-col gap-3 rounded-[20px] bg-inchiostro-velo p-4">
              <label class="text-sm font-semibold" for="altro-nome">Nuova categoria</label>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="grid h-[52px] w-[52px] flex-none place-items-center rounded-full bg-inchiostro-velo text-2xl hover:shadow-[inset_0_0_0_2px_var(--color-inchiostro)]"
                  :aria-expanded="altro.emojiAperte"
                  aria-label="Scegli l'emoji"
                  @click="altro.emojiAperte = !altro.emojiAperte"
                >
                  <Emoji :e="altro.icona" />
                </button>
                <input id="altro-nome" v-model="altro.nome" maxlength="30" placeholder="Es. Farmacia" autocomplete="off" class="h-[52px] min-w-0 flex-1 rounded-full bg-inchiostro-velo px-5 text-inchiostro outline-none placeholder:text-inchiostro/55 focus:shadow-[inset_0_0_0_2px_var(--color-inchiostro)]" />
              </div>
              <div v-if="altro.emojiAperte" class="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Emoji della categoria">
                <button
                  v-for="e in EMOJI"
                  :key="e"
                  type="button"
                  role="radio"
                  :aria-checked="altro.icona === e"
                  class="grid aspect-square place-items-center rounded-xl text-[22px] hover:bg-inchiostro-velo"
                  :class="{ 'shadow-[inset_0_0_0_2px_var(--color-inchiostro)]': altro.icona === e }"
                  @click="(altro.icona = e), (altro.emojiAperte = false)"
                >
                  <Emoji :e="e" />
                </button>
              </div>
              <p v-if="errori.altro" class="flex items-center gap-1.5 text-[13px] font-semibold"><i class="ph-bold ph-warning-circle" />{{ errori.altro }}</p>
              <label class="flex cursor-pointer items-center justify-between gap-4 border-t border-inchiostro-velo pt-3">
                <span>
                  <b class="block text-sm font-semibold">Aggiungi alle mie categorie</b>
                  <small class="text-[12.5px]">{{ altro.aggiungi ? "La ritrovi qui tra le pillole e in Impostazioni" : "Vale solo per questo movimento (resta nei report)" }}</small>
                </span>
                <Interruttore v-model="altro.aggiungi" class="sul-blocco" />
              </label>
            </div>
          </div>

          <div>
            <label class="mb-2.5 block text-sm font-semibold" for="desc">Descrizione</label>
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

          <div class="flex flex-col rounded-[20px] bg-inchiostro-velo">
            <label class="flex cursor-pointer items-center justify-between gap-4 px-5 py-3.5">
              <span><b class="block text-[14.5px] font-semibold">Ricorrente</b><small class="text-[13px]">Si ripete ogni mese lo stesso giorno</small></span>
              <Interruttore v-model="form.ricorrente" class="sul-blocco" />
            </label>
            <label class="flex cursor-pointer items-center justify-between gap-4 border-t border-inchiostro-velo px-5 py-3.5">
              <span>
                <b class="block text-[14.5px] font-semibold">{{ entrata ? "Ricevuta in contanti" : "Pagata in contanti" }}</b>
                <small class="text-[13px]">Esclusa dal confronto con l'estratto conto</small>
              </span>
              <Interruttore v-model="form.contanti" class="sul-blocco" />
            </label>
          </div>

          <div v-if="!entrata && !originale">
            <input ref="inputFoto" type="file" accept="image/*" class="hidden" @change="scansiona" />
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
              {{ salvando ? "Salvo…" : originale ? "Salva modifiche" : entrata ? "Salva entrata" : "Salva uscita" }}
            </button>
            <button type="button" class="h-[60px] px-4 text-[14.5px] font-semibold underline underline-offset-4" @click="originale ? chiudiModifica() : svuota()">
              {{ originale ? "Annulla" : "Svuota" }}
            </button>
          </div>
          <button v-if="originale" type="button" class="-mt-1.5 flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold hover:bg-inchiostro-velo" @click="elimina">
            <i class="ph-bold ph-trash" />Elimina movimento
          </button>
        </form>
      </section>

      <!-- Elenco del mese -->
      <section class="panel reveal" style="--i: 1" aria-label="Movimenti del mese">
        <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
          <MeseNav v-model="mese" @sposta="sposta" />
          <div class="seg" role="group" aria-label="Filtra i movimenti">
            <button :aria-pressed="filtro === 'tutti'" @click="filtro = 'tutti'">Tutti</button>
            <button :aria-pressed="filtro === 'entrate'" @click="filtro = 'entrate'">Entrate</button>
            <button :aria-pressed="filtro === 'uscite'" @click="filtro = 'uscite'">Uscite</button>
          </div>
        </div>
        <div class="mb-6 grid grid-cols-3 gap-1.5 sm:gap-2">
          <div v-for="b in [{ l: 'Entrate', v: tot.entrate, c: 'bg-salvia' }, { l: 'Uscite', v: tot.uscite, c: 'bg-arancio' }, { l: 'Saldo', v: tot.saldo, c: 'bg-crema' }]" :key="b.l" class="min-w-0 rounded-[20px] px-3 py-3 text-inchiostro sm:px-5 sm:py-4" :class="b.c">
            <small class="text-[13px] font-medium">{{ b.l }}</small>
            <b class="mt-3 block truncate text-[clamp(15px,4.4vw,18px)] leading-none font-normal sm:text-2xl"><Euro :v="b.v" /></b>
          </div>
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
              <span class="grid h-11 w-11 flex-none place-items-center rounded-full bg-campo text-[22px] group-hover:bg-card"><Emoji :e="m.cat.icona || '🏷️'" /></span>
              <span class="min-w-0 flex-1">
                <b class="block truncate text-[15px] font-medium">
                  {{ m.Descrizione || m.cat.Nome }}
                  <span v-if="m.TransazioneRicorrente" class="ml-2 text-[11.5px] font-normal text-testo2"><i class="ph-bold ph-repeat" /> ogni mese</span>
                </b>
                <small class="block truncate text-[13px] text-testo2">{{ m.cat.Nome }}<template v-if="m.Contanti"> · contanti</template></small>
              </span>
              <span class="num font-medium whitespace-nowrap" :class="m.tipo === 'entrata' ? 'text-fg-positivo' : 'text-fg-negativo'">
                {{ eur(m.tipo === "entrata" ? m.importo : -m.importo, { segno: true }) }}
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

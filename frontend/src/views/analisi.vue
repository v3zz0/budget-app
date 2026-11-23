<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/stores/auth.js";
import { useWalletStore } from "@/stores/wallet.js";
import { analizzaEstratti, erroreAnalisi } from "@/services/analisi.js";
import { aggiornaCampi, creaTransazione } from "@/services/transazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { chiave, daControllare } from "@/utils/analisi.js";
import { chiaveMese, nomeMese, spostaMese } from "@/utils/budget.js";
import { eur } from "@/utils/formato.js";

const toast = useToast();
const auth = useAuthStore();
const walletStore = useWalletStore();

const MOTORI = { ollama: ["Server Ollama", "ph-hard-drives"], llamacpp: ["llama.cpp", "ph-terminal-window"], openrouter: ["OpenRouter", "ph-cloud"] };
const motore = computed(() => MOTORI[auth.userInfo.aiMotore || "ollama"]);

// ── 1. Caricamento ───────────────────────────────────────────────────────────
const oggi = new Date();
const mese = ref({ anno: oggi.getFullYear(), mese: oggi.getMonth() + 1 });
const nomeDelMese = computed(() => nomeMese(mese.value.mese).toLowerCase());
const files = ref([]);
const sopra = ref(false);
const inputFile = ref(null);
const stato = ref("carica"); // carica | corso | risultato
const errore = ref(null);
const report = ref(null);

function aggiungi(lista) {
  for (const f of lista) {
    if (!/\.(pdf|csv)$/i.test(f.name)) {
      toast.add({ severity: "warn", summary: `${f.name}: solo PDF o CSV`, life: 3000 });
      continue;
    }
    // Lo stesso file due volte raddoppierebbe i suoi movimenti nel confronto.
    if (!files.value.some((x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)) files.value.push(f);
  }
}
const peso = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
watch(() => walletStore.walletId, () => nuova());

// ── 2. In corso ──────────────────────────────────────────────────────────────
// Una richiesta sola: i passaggi avanzano a tempo e si chiudono tutti alla
// risposta. Dicono chi fa cosa (server o AI), non misurano il server.
const PASSI = [
  { t: "Leggo i movimenti", s: "Lettura esatta del file", chi: "server" },
  { t: "Confronto con le transazioni", s: "Data, importo e descrizione", chi: "server" },
  { t: "Suggerisco le categorie", s: "Per i movimenti che mancano", chi: "AI" },
  { t: "Scrivo il giudizio del mese", s: "Una frase sul mese", chi: "AI" },
];
const passo = ref(0);
let timer = null;
onBeforeUnmount(() => clearInterval(timer));

async function analizza() {
  const id = walletStore.walletId;
  stato.value = "corso";
  errore.value = null;
  passo.value = 0;
  clearInterval(timer);
  timer = setInterval(() => passo.value < PASSI.length - 1 && passo.value++, 1800);
  try {
    const r = await analizzaEstratti({ files: files.value, walletId: id, mese: chiaveMese(mese.value.anno, mese.value.mese) });
    if (id !== walletStore.walletId) return; // cambiato portafoglio nel frattempo
    report.value = r;
    chiuse.value = new Set();
    stato.value = "risultato";
  } catch (e) {
    errore.value = erroreAnalisi(e);
    stato.value = "carica";
  } finally {
    clearInterval(timer);
    passo.value = PASSI.length;
  }
}
function nuova() {
  report.value = null;
  files.value = [];
  stato.value = "carica";
}

// ── 3. Risultato ─────────────────────────────────────────────────────────────
const chiuse = ref(new Set()); // incongruenze risolte o ignorate
const esiti = reactive({}); // chiave -> etichetta mostrata sulla card chiusa
const aperta = ref(null); // mancante con il pannello "Registra" aperto
const categoriaScelta = ref(null);
const occupato = ref(false);
const nDaControllare = computed(() => daControllare(report.value, chiuse.value));
const nellApp = computed(() => (report.value ? report.value.abbinati.length + report.value.soloApp.length + report.value.diversi.length : 0));
const breve = (d) => `${Number(d.slice(8, 10))} ${nomeMese(Number(d.slice(5, 7))).slice(0, 3).toLowerCase()}`;

function chiudi(x, etichetta) {
  chiuse.value = new Set([...chiuse.value, chiave(x)]);
  esiti[chiave(x)] = etichetta;
  aperta.value = null;
}
// Categorie dove registrare un mancante: del suo tipo, di tutti i portafogli
// (l'estratto conto è uno solo, i portafogli tanti).
const categoriePer = (m) => (report.value?.categorie || []).filter((c) => c.tipo === m.tipo && !c.nascosta);
const suggerita = (m) => categoriePer(m).find((c) => c.nome.toLowerCase() === (m.categoriaSuggerita || "").toLowerCase());
function apriRegistra(m) {
  aperta.value = aperta.value === chiave(m) ? null : chiave(m);
  categoriaScelta.value = suggerita(m)?.documentId ?? null;
}

async function azione(fn, x, etichetta, messaggio) {
  occupato.value = true;
  try {
    await fn();
    chiudi(x, etichetta);
    toast.add({ severity: "success", summary: messaggio, life: 2500 });
  } catch (e) {
    toast.add({ severity: "error", summary: "Non riuscito", detail: erroreLeggibile(e), life: 4000 });
  } finally {
    occupato.value = false;
  }
}
const registra = (m) =>
  azione(
    () => creaTransazione({ importo: m.importo, descrizione: m.descrizione, data: m.data, ricorrente: false, contanti: false, categoriaId: categoriaScelta.value }),
    m, "Registrata", `${m.descrizione} registrata`,
  );
const contanti = (t) => azione(() => aggiornaCampi(t.documentId, { Contanti: true }), t, "Segnata in contanti", "Segnata come pagata in contanti");
const usaBanca = (d) => azione(() => aggiornaCampi(d.app.documentId, { Importo: d.banca.importo }), d, "Importo corretto", `Importo corretto a ${eur(d.banca.importo)}`);
const ignora = (x) => chiudi(x, "Ignorata");
</script>

<template>
  <div>
    <div class="mb-8 sm:mb-10">
      <div class="eyebrow">Confronto con la banca</div>
      <h1 class="display">Analisi</h1>
    </div>

    <!-- 1. Caricamento -->
    <section v-if="stato === 'carica'" class="mb-12 grid grid-cols-[minmax(0,1fr)] gap-3 min-[981px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" aria-label="Carica l'estratto conto">
      <div
        class="reveal relative flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-[20px] bg-card px-5 py-8 text-center shadow-[inset_0_0_0_1.5px_var(--color-bordo-forte)] transition sm:min-h-[340px] sm:rounded-[28px] sm:px-8 sm:py-10"
        :class="{ 'bg-campo! shadow-[inset_0_0_0_2px_var(--color-anello)]!': sopra }"
        @dragover.prevent="sopra = true"
        @dragleave="sopra = false"
        @drop.prevent="(sopra = false), aggiungi([...$event.dataTransfer.files])"
      >
        <span class="grid h-[76px] w-[76px] place-items-center rounded-full bg-crema text-[34px] text-inchiostro"><i class="ph-bold ph-file-arrow-up" /></span>
        <h2 class="text-[26px] leading-tight font-medium tracking-[-0.035em]">Trascina qui l'estratto conto</h2>
        <p class="max-w-[42ch] text-[14.5px] text-testo2">PDF o CSV, anche più file e da conti diversi: vengono confrontati tutti insieme con le transazioni registrate.</p>
        <button type="button" class="pill-btn pill-btn--cream mt-2" @click="inputFile.click()"><i class="ph-bold ph-folder-open" />Scegli file</button>
        <input ref="inputFile" type="file" accept=".pdf,.csv" multiple class="sr-only" tabindex="-1" @change="aggiungi([...$event.target.files]), ($event.target.value = '')" />
        <div v-if="files.length" class="mt-2 flex flex-wrap justify-center gap-2" aria-live="polite">
          <span v-for="(f, i) in files" :key="f.name + f.size" class="inline-flex h-10 max-w-full items-center gap-2 rounded-full bg-campo pr-1.5 pl-3.5 text-[13.5px]">
            <i class="ph-bold flex-none text-[17px] text-fg-accento" :class="/\.csv$/i.test(f.name) ? 'ph-file-csv' : 'ph-file-pdf'" />
            <span class="truncate">{{ f.name }}</span>
            <small class="flex-none font-mono text-[11.5px] text-testo2">{{ peso(f.size) }}</small>
            <button type="button" class="grid h-7 w-7 flex-none place-items-center rounded-full text-testo2 hover:bg-bordo hover:text-testo" :aria-label="`Togli ${f.name}`" @click="files.splice(i, 1)">
              <i class="ph-bold ph-x" />
            </button>
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-3">
        <div class="panel p-6!">
          <div class="mb-3 text-[13px] font-medium text-testo2">Mese da analizzare</div>
          <div class="flex items-center justify-between gap-2">
            <button class="circle-btn h-10! w-10! bg-campo! text-base!" aria-label="Mese precedente" @click="mese = spostaMese(mese, -1)"><i class="ph-bold ph-caret-left" /></button>
            <b class="text-[22px] font-medium tracking-[-0.035em] sm:text-[26px]">{{ nomeMese(mese.mese) }} {{ mese.anno }}</b>
            <button class="circle-btn h-10! w-10! bg-campo! text-base!" aria-label="Mese successivo" @click="mese = spostaMese(mese, 1)"><i class="ph-bold ph-caret-right" /></button>
          </div>
        </div>
        <div class="panel p-6!">
          <div class="mb-3 text-[13px] font-medium text-testo2">Analisi AI</div>
          <div class="flex items-center gap-3">
            <span class="grid h-11 w-11 flex-none place-items-center rounded-full bg-campo text-xl"><i class="ph-bold" :class="motore[1]" /></span>
            <div class="min-w-0">
              <b class="block text-[15px] font-medium">{{ motore[0] }}</b>
              <small class="block truncate font-mono text-[12.5px] text-testo2">{{ auth.userInfo.aiModello || "modello predefinito" }}</small>
            </div>
            <router-link to="/impostazioni#ai" class="ml-auto text-[13.5px] font-medium text-testo2 underline underline-offset-[3px] hover:text-testo">Cambia</router-link>
          </div>
          <p class="mt-4 flex gap-1.5 text-[12.5px] leading-snug text-testo2">
            <i class="ph-bold ph-info mt-0.5" />I movimenti vengono letti in modo esatto, senza AI. Il modello suggerisce le categorie e scrive il giudizio del mese.
          </p>
        </div>
        <p v-if="errore" class="box-errore">{{ errore }}</p>
        <button class="pill-btn pill-btn--cream h-16! w-full text-base" :disabled="!files.length || !walletStore.walletId" @click="analizza">Analizza {{ nomeDelMese }}</button>
      </div>
    </section>

    <!-- 2. In corso -->
    <section v-else-if="stato === 'corso'" class="mb-12 grid items-center gap-8 min-[981px]:grid-cols-2 min-[981px]:gap-12" aria-live="polite">
      <div>
        <div class="eyebrow">{{ files.length === 1 ? files[0].name : `${files.length} file` }}</div>
        <h2 class="text-[clamp(32px,4vw,44px)] leading-[1.05] font-medium tracking-[-0.045em]">Sto confrontando la banca con le tue transazioni</h2>
        <p class="mt-3 max-w-[40ch] text-testo2">Di solito ci vuole meno di un minuto. Con PDF lunghi può servire qualche secondo in più.</p>
      </div>
      <div class="flex flex-col gap-2.5">
        <div
          v-for="(p, i) in PASSI"
          :key="p.t"
          class="flex items-center gap-4 rounded-[20px] bg-card px-5 py-4 transition-colors"
          :class="i <= passo ? 'text-testo' : 'text-testo2'"
        >
          <span class="grid h-9 w-9 flex-none place-items-center rounded-full text-base" :class="i < passo ? 'bg-crema text-inchiostro' : 'bg-campo'">
            <i class="ph-bold" :class="i < passo ? 'ph-check' : i === passo ? 'ph-circle-notch animate-spin' : 'ph-circle'" />
          </span>
          <span class="min-w-0">
            <b class="block font-medium">{{ p.t }}</b>
            <small class="block text-[12.5px] text-testo2">{{ p.s }}</small>
          </span>
          <span class="ml-auto font-mono text-[11.5px] text-testo3">{{ p.chi }}</span>
        </div>
      </div>
    </section>

    <!-- 3. Risultato -->
    <section v-else-if="report">
      <div v-if="report.validazione?.warning" class="mb-6 flex items-start gap-3 rounded-[20px] bg-card px-5 py-4 text-sm shadow-[inset_0_0_0_1.5px_var(--color-bordo-forte)]">
        <i class="ph-bold ph-warning mt-px text-lg text-fg-accento" />
        <div>{{ report.validazione.warning }}</div>
      </div>

      <div class="mb-12 grid grid-cols-12 gap-3 sm:mb-16">
        <div class="blocco reveal col-span-12 flex min-h-0 flex-col gap-6 bg-crema sm:p-8 min-[981px]:col-span-7 min-[981px]:min-h-[320px]">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div v-if="nDaControllare" class="num text-[clamp(64px,8vw,104px)] leading-[.9] tracking-[-0.06em]">{{ nDaControllare }}</div>
              <h2 class="mt-2 text-[26px] leading-[1.1] font-medium tracking-[-0.035em]">
                {{ nDaControllare ? (nDaControllare === 1 ? "cosa da controllare" : "cose da controllare") : "Mese in regola" }}
              </h2>
            </div>
            <span class="chip whitespace-nowrap">{{ nomeMese(Number(report.mese.slice(5, 7))) }} {{ report.mese.slice(0, 4) }}</span>
          </div>
          <blockquote v-if="report.giudizio" class="mt-auto max-w-[58ch] border-t-[1.5px] border-inchiostro-linea pt-5 text-[15.5px] leading-relaxed">
            {{ report.giudizio }}
            <span class="mt-3 flex items-center gap-1.5 text-[12.5px] font-medium"><i class="ph-bold ph-sparkle" />Giudizio dell'AI · {{ report.modello }}</span>
          </blockquote>
          <p v-else class="mt-auto border-t-[1.5px] border-inchiostro-linea pt-5 text-[14.5px]">
            {{ nDaControllare ? "Risolvi le incongruenze qui sotto: i contatori scendono man mano." : "Ogni movimento della banca corrisponde a una transazione dell'app." }}
          </p>
        </div>
        <div class="col-span-12 grid grid-cols-2 gap-3 min-[981px]:col-span-5">
          <div class="flex flex-col justify-between gap-5 rounded-[20px] bg-card px-6 py-5 sm:rounded-[28px]"><small class="text-[13.5px] font-medium text-testo2">In banca</small><b class="num text-[34px] leading-none font-normal sm:text-[44px]">{{ report.inBanca }}</b></div>
          <div class="flex flex-col justify-between gap-5 rounded-[20px] bg-card px-6 py-5 sm:rounded-[28px]"><small class="text-[13.5px] font-medium text-testo2">Nell'app</small><b class="num text-[34px] leading-none font-normal sm:text-[44px]">{{ nellApp }}</b></div>
          <div class="flex flex-col justify-between gap-5 rounded-[20px] bg-crema px-6 py-5 text-inchiostro sm:rounded-[28px]"><small class="text-[13.5px] font-medium">Corrispondono</small><b class="num text-[34px] leading-none font-normal sm:text-[44px]">{{ report.abbinati.length }}</b></div>
          <div class="flex flex-col justify-between gap-5 rounded-[20px] px-6 py-5 text-inchiostro sm:rounded-[28px]" :class="nDaControllare ? 'bg-arancio' : 'bg-crema'"><small class="text-[13.5px] font-medium">Da controllare</small><b class="num text-[34px] leading-none font-normal sm:text-[44px]">{{ nDaControllare }}</b></div>
        </div>
      </div>

      <div class="mb-6">
        <h2 class="text-[26px] leading-none font-medium tracking-[-0.04em] sm:text-[32px]">Incongruenze</h2>
        <p class="mt-2 text-sm text-testo2">Ognuna si risolve da qui. Le transazioni in contanti sono escluse dal confronto.</p>
      </div>

      <div class="mb-12 flex flex-col gap-10 sm:mb-16">
        <!-- In banca, non nell'app -->
        <div>
          <h3 class="mb-1.5 flex items-center gap-3 text-[17px] font-semibold tracking-[-0.015em]">
            In banca, non nell'app <span class="grid h-7 min-w-7 place-items-center rounded-full bg-campo px-2 text-[13px]">{{ report.mancanti.filter((x) => !chiuse.has(chiave(x))).length }}</span>
          </h3>
          <p class="mb-4 text-[13.5px] text-testo2">Movimenti che la banca ha visto ma che non hai registrato.</p>
          <p v-if="!report.mancanti.length" class="text-sm text-testo2">Nessuno.</p>
          <div class="flex flex-col gap-2">
            <article
              v-for="m in report.mancanti"
              :key="chiave(m)"
              class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-[20px] bg-card p-4 transition-opacity sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5"
              :class="{ 'opacity-50': chiuse.has(chiave(m)) }"
            >
              <span class="grid h-11 w-11 place-items-center rounded-full text-xl text-inchiostro" :class="m.tipo === 'entrata' ? 'bg-salvia' : 'bg-arancio'">
                <i class="ph-bold" :class="m.tipo === 'entrata' ? 'ph-arrow-down-left' : 'ph-arrow-up-right'" />
              </span>
              <div class="min-w-0">
                <b class="block text-[15px] font-medium">{{ m.tipo === "entrata" ? "Accredito" : "Addebito" }} del {{ breve(m.data) }}</b>
                <div class="truncate font-mono text-[12.5px] text-testo2">{{ m.descrizione }}</div>
                <div v-if="suggerita(m)" class="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-testo2">
                  <span class="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-campo pr-2.5 pl-1.5 text-[12.5px] text-testo">
                    <i class="ph-bold ph-sparkle text-fg-accento" /><Emoji :e="suggerita(m).icona || '🏷️'" class="h-4! w-4!" />{{ suggerita(m).nome }}
                  </span>
                </div>
              </div>
              <div class="col-span-2 flex items-center justify-between gap-2.5 sm:col-span-1 sm:flex-col sm:items-end">
                <span class="num text-xl tracking-[-0.03em]" :class="m.tipo === 'entrata' ? 'text-fg-positivo' : 'text-fg-negativo'">{{ eur(m.tipo === "entrata" ? m.importo : -m.importo, { segno: true }) }}</span>
                <span v-if="chiuse.has(chiave(m))" class="inline-flex items-center gap-1.5 text-[13px] font-medium"><i class="ph-bold ph-check" />{{ esiti[chiave(m)] }}</span>
                <span v-else-if="aperta !== chiave(m)" class="flex gap-1.5">
                  <button class="inline-flex h-[38px] items-center gap-1.5 rounded-full bg-crema px-4 text-[13.5px] font-semibold text-inchiostro hover:bg-crema-scuro" @click="apriRegistra(m)">Registra</button>
                  <button class="inline-flex h-[38px] items-center rounded-full px-4 text-[13.5px] font-semibold text-testo2 shadow-[inset_0_0_0_1.5px_var(--color-bordo-forte)] hover:text-testo" @click="ignora(m)">Ignora</button>
                </span>
              </div>
              <div v-if="aperta === chiave(m)" class="col-span-full border-t border-bordo pt-4">
                <div class="mb-2.5 text-[13px] font-medium text-testo2">Categoria</div>
                <div class="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Categoria">
                  <button
                    v-for="c in categoriePer(m)"
                    :key="c.documentId"
                    type="button"
                    role="radio"
                    :aria-checked="categoriaScelta === c.documentId"
                    class="inline-flex h-10 items-center gap-2 rounded-full bg-campo pr-4 pl-2.5 text-sm"
                    :class="{ 'bg-crema! text-inchiostro': categoriaScelta === c.documentId }"
                    @click="categoriaScelta = c.documentId"
                  >
                    <Emoji :e="c.icona || '🏷️'" class="h-5! w-5!" />{{ c.nome }}
                    <span v-if="walletStore.wallets.length > 1" class="text-[11px] opacity-70">· {{ c.wallet }}</span>
                    <span v-if="suggerita(m)?.documentId === c.documentId" class="font-mono text-[11px] opacity-70">AI</span>
                  </button>
                  <p v-if="!categoriePer(m).length" class="text-sm text-testo2">
                    Nessuna categoria di {{ m.tipo === "entrata" ? "entrata" : "spesa" }}: creane una in
                    <router-link to="/impostazioni#categorie" class="underline">Impostazioni</router-link>.
                  </p>
                </div>
                <div class="flex justify-end gap-2">
                  <button class="pill-btn pill-btn--ghost h-11! px-5!" @click="aperta = null">Annulla</button>
                  <button class="pill-btn pill-btn--cream h-11! px-5!" :disabled="!categoriaScelta || occupato" @click="registra(m)">Registra nell'app</button>
                </div>
              </div>
            </article>
          </div>
        </div>

        <!-- Nell'app, non in banca -->
        <div>
          <h3 class="mb-1.5 flex items-center gap-3 text-[17px] font-semibold tracking-[-0.015em]">
            Nell'app, non in banca <span class="grid h-7 min-w-7 place-items-center rounded-full bg-campo px-2 text-[13px]">{{ report.soloApp.filter((x) => !chiuse.has(chiave(x))).length }}</span>
          </h3>
          <p class="mb-4 text-[13.5px] text-testo2">Transazioni registrate che la banca non mostra: forse pagate in contanti.</p>
          <p v-if="!report.soloApp.length" class="text-sm text-testo2">Nessuna.</p>
          <div class="flex flex-col gap-2">
            <article v-for="t in report.soloApp" :key="chiave(t)" class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-[20px] bg-card p-4 transition-opacity sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5" :class="{ 'opacity-50': chiuse.has(chiave(t)) }">
              <span class="grid h-11 w-11 place-items-center rounded-full bg-campo text-[22px]"><Emoji :e="t.icona || '🏷️'" /></span>
              <div class="min-w-0">
                <b class="block truncate text-[15px] font-medium">{{ t.descrizione || t.categoria }}</b>
                <div class="text-[13px] text-testo2">{{ breve(t.data) }} · {{ t.categoria }}</div>
              </div>
              <div class="col-span-2 flex items-center justify-between gap-2.5 sm:col-span-1 sm:flex-col sm:items-end">
                <span class="num text-xl tracking-[-0.03em]" :class="t.tipo === 'entrata' ? 'text-fg-positivo' : 'text-fg-negativo'">{{ eur(t.tipo === "entrata" ? t.importo : -t.importo, { segno: true }) }}</span>
                <span v-if="chiuse.has(chiave(t))" class="inline-flex items-center gap-1.5 text-[13px] font-medium"><i class="ph-bold ph-check" />{{ esiti[chiave(t)] }}</span>
                <span v-else class="flex gap-1.5">
                  <button class="inline-flex h-[38px] items-center rounded-full bg-crema px-4 text-[13.5px] font-semibold text-inchiostro hover:bg-crema-scuro" :disabled="occupato" @click="contanti(t)">Era in contanti</button>
                  <button class="inline-flex h-[38px] items-center rounded-full px-4 text-[13.5px] font-semibold text-testo2 shadow-[inset_0_0_0_1.5px_var(--color-bordo-forte)] hover:text-testo" @click="ignora(t)">Ignora</button>
                </span>
              </div>
            </article>
          </div>
        </div>

        <!-- Importo diverso -->
        <div>
          <h3 class="mb-1.5 flex items-center gap-3 text-[17px] font-semibold tracking-[-0.015em]">
            Importo diverso <span class="grid h-7 min-w-7 place-items-center rounded-full bg-campo px-2 text-[13px]">{{ report.diversi.filter((x) => !chiuse.has(chiave(x))).length }}</span>
          </h3>
          <p class="mb-4 text-[13.5px] text-testo2">Stesso movimento, ma la cifra registrata non è quella della banca.</p>
          <p v-if="!report.diversi.length" class="text-sm text-testo2">Nessuno.</p>
          <div class="flex flex-col gap-2">
            <article v-for="d in report.diversi" :key="chiave(d)" class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-[20px] bg-card p-4 transition-opacity sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5" :class="{ 'opacity-50': chiuse.has(chiave(d)) }">
              <span class="grid h-11 w-11 place-items-center rounded-full bg-campo text-[22px]"><Emoji :e="d.app.icona || '🏷️'" /></span>
              <div class="min-w-0">
                <b class="block truncate text-[15px] font-medium">{{ d.app.descrizione || d.app.categoria }}</b>
                <div class="truncate font-mono text-[12.5px] text-testo2">{{ d.banca.descrizione }}</div>
                <div class="mt-1.5 flex items-center gap-2.5 text-sm">
                  <s class="num text-testo3">app {{ eur(d.app.importo) }}</s><i class="ph-bold ph-arrow-right text-testo3" /><span class="num">banca {{ eur(d.banca.importo) }}</span>
                </div>
              </div>
              <div class="col-span-2 flex items-center justify-end gap-2.5 sm:col-span-1 sm:flex-col sm:items-end">
                <span v-if="chiuse.has(chiave(d))" class="inline-flex items-center gap-1.5 text-[13px] font-medium"><i class="ph-bold ph-check" />{{ esiti[chiave(d)] }}</span>
                <span v-else class="flex gap-1.5">
                  <button class="inline-flex h-[38px] items-center rounded-full bg-crema px-4 text-[13.5px] font-semibold text-inchiostro hover:bg-crema-scuro" :disabled="occupato" @click="usaBanca(d)">Usa importo banca</button>
                  <button class="inline-flex h-[38px] items-center rounded-full px-4 text-[13.5px] font-semibold text-testo2 shadow-[inset_0_0_0_1.5px_var(--color-bordo-forte)] hover:text-testo" @click="ignora(d)">Ignora</button>
                </span>
              </div>
            </article>
          </div>
        </div>

        <details v-if="report.abbinati.length" class="group">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[20px] bg-card px-6 py-5 group-open:rounded-b-none [&::-webkit-details-marker]:hidden">
            <b class="flex items-center gap-2.5 text-[15px] font-medium"><i class="ph-bold ph-check-circle text-xl text-fg-accento" />{{ report.abbinati.length }} {{ report.abbinati.length === 1 ? "movimento corrisponde" : "movimenti corrispondono" }}</b>
            <i class="ph-bold ph-caret-down text-testo2 transition-transform group-open:rotate-180" />
          </summary>
          <div class="rounded-b-[20px] bg-card px-6 pb-4">
            <div v-for="a in report.abbinati" :key="a.app.documentId" class="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 border-t border-bordo py-3 text-sm sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <span class="text-[13px] text-testo2">{{ breve(a.banca.data) }}</span>
              <span class="hidden truncate font-mono text-xs text-testo2 sm:block">{{ a.banca.descrizione }}</span>
              <span class="flex min-w-0 items-center gap-2"><Emoji :e="a.app.icona || '🏷️'" class="h-[18px]! w-[18px]! flex-none" /><span class="truncate">{{ a.app.descrizione || a.app.categoria }}</span></span>
              <span class="num font-medium" :class="a.app.tipo === 'entrata' ? 'text-fg-positivo' : 'text-fg-negativo'">{{ eur(a.app.tipo === "entrata" ? a.app.importo : -a.app.importo, { segno: true }) }}</span>
            </div>
          </div>
        </details>
      </div>

      <div class="flex justify-center">
        <button class="pill-btn pill-btn--ghost" @click="nuova"><i class="ph-bold ph-arrow-counter-clockwise" />Nuova analisi</button>
      </div>
    </section>
  </div>
</template>

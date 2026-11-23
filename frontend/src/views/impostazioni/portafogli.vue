<script setup>
import { computed, reactive, ref, watch } from "vue";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import {
  aggiornaWallet, contaTransazioniWallet, creaWallet, elencaCategorie, eliminaWallet, impostaEsclusione,
} from "@/services/impostazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { eur } from "@/utils/formato.js";
import Interruttore from "@/components/Interruttore.vue";
import Avatar from "@/components/Avatar.vue";
import Condivisione from "./condivisione.vue";

const confirm = useConfirm();
const toast = useToast();
const walletStore = useWalletStore();
const avviso = (severity, summary, detail) => toast.add({ severity, summary, detail, life: 3500 });
const errore = (e) => avviso("error", "Errore", erroreLeggibile(e));

const sel = computed(() => walletStore.selectedWallet);
// budget null e non 0: un campo vuoto si digita subito
const form = reactive({ nome: "", budget: null });
const salvando = ref(false);
const nuovo = reactive({ aperto: false, nome: "", budget: null, salvando: false });

// Quante transazioni ha ogni portafoglio: una richiesta da una riga ciascuno.
const conteggi = ref({});
watch(
  () => walletStore.wallets.map((w) => w.documentId).join(),
  async () => {
    const coppie = await Promise.all(
      walletStore.wallets.map(async (w) => [w.documentId, await contaTransazioniWallet(w.documentId).catch(() => null)]),
    );
    conteggi.value = Object.fromEntries(coppie);
  },
  { immediate: true },
);

// Categorie di spesa del portafoglio scelto, per il controllo dal vivo sul budget.
const categorie = ref([]);
watch(
  sel,
  async (w) => {
    form.nome = w?.Nome ?? "";
    form.budget = w?.Budget ?? null;
    categorie.value = [];
    if (w) categorie.value = await elencaCategorie(w.documentId).catch(() => []);
  },
  { immediate: true },
);
const budgetCategorie = computed(() =>
  categorie.value.filter((c) => (c.Tipo || "uscita") === "uscita").reduce((s, c) => s + (Number(c.Budget_categoria) || 0), 0),
);
const liberi = computed(() => (Number(form.budget) || 0) - budgetCategorie.value);

const modificato = computed(
  () => !!sel.value && (form.nome.trim() !== (sel.value.Nome ?? "") || (Number(form.budget) || 0) !== (Number(sel.value.Budget) || 0)),
);

// Salvataggio esplicito e non a debounce: un salvataggio a metà digitazione
// scriverebbe sul server un nome incompleto.
async function salva() {
  if (!form.nome.trim()) return avviso("warn", "Il nome non può essere vuoto");
  salvando.value = true;
  try {
    await aggiornaWallet(sel.value.documentId, form.nome.trim(), Number(form.budget) || 0);
    await walletStore.carica();
    avviso("success", "Portafoglio aggiornato");
  } catch (e) {
    errore(e);
  } finally {
    salvando.value = false;
  }
}

// Prima il server: se la chiamata fallisce l'interruttore non si muove.
async function cambiaEsclusione(escluso) {
  try {
    await impostaEsclusione(sel.value.documentId, escluso);
    await walletStore.carica();
  } catch (e) {
    errore(e);
  }
}

async function crea() {
  if (!nuovo.nome.trim()) return;
  nuovo.salvando = true;
  try {
    // Il server gli crea anche il salvadanaio "Risparmi mensili"
    const creato = await creaWallet(nuovo.nome.trim(), Number(nuovo.budget) || 0);
    await walletStore.carica();
    const w = walletStore.wallets.find((x) => x.documentId === creato.documentId);
    if (w) walletStore.setSelectedWallet(w);
    nuovo.aperto = false;
    avviso("success", "Portafoglio creato");
  } catch (e) {
    errore(e);
  } finally {
    nuovo.salvando = false;
  }
}

const mioWallet = computed(() => !sel.value?.condiviso || walletStore.creatoDaMe(sel.value));
function elimina() {
  const w = sel.value;
  const n = conteggi.value[w.documentId];
  confirm.require({
    header: `Eliminare “${w.Nome}”?`,
    message:
      `Si perdono ${n != null ? `le sue ${n} transazioni` : "tutte le sue transazioni"}, le categorie e lo storico del salvadanaio. Non si può annullare.` +
      (w.condiviso ? `\n\nSparisce anche per ${walletStore.partnerDi(w)?.nome || "l'altra persona"}.` : ""),
    acceptLabel: "Elimina portafoglio",
    accept: async () => {
      try {
        await eliminaWallet(w.documentId);
        await walletStore.carica();
        avviso("success", "Portafoglio eliminato");
      } catch (e) {
        errore(e);
      }
    },
  });
}
</script>

<template>
  <section class="panel reveal">
    <h2 class="text-[28px] leading-[1.05] font-medium tracking-[-0.04em] sm:text-[34px]">Portafogli e budget</h2>
    <p class="mt-3 max-w-[60ch] text-testo2">
      Ogni portafoglio ha il suo budget, le sue categorie e il suo salvadanaio. Lo cambi dal selettore in alto.
    </p>
  </section>

  <section class="panel">
    <h3 class="mb-5 text-[17px] font-semibold tracking-[-0.015em]">I tuoi portafogli</h3>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
      <button
        v-for="w in walletStore.wallets"
        :key="w.documentId"
        type="button"
        class="flex min-h-[150px] min-w-0 flex-col gap-6 rounded-[20px] p-5 text-left transition-colors"
        :class="w.documentId === sel?.documentId ? 'bg-crema text-inchiostro' : 'bg-campo hover:bg-bordo'"
        :aria-pressed="w.documentId === sel?.documentId"
        @click="walletStore.setSelectedWallet(w)"
      >
        <span class="flex items-center justify-between gap-2">
          <span v-if="w.condiviso" class="flex">
            <Avatar :p="walletStore.io" :size="28" />
            <Avatar :p="walletStore.partnerDi(w)" :size="28" class="-ml-[7px]" />
          </span>
          <i v-else class="ph-bold ph-wallet text-[22px]" />
          <span v-if="w.escludiDaStatistiche" class="chip">fuori dalle statistiche</span>
          <span v-else-if="w.condiviso && walletStore.partnerDi(w)" class="chip">con {{ walletStore.partnerDi(w).nome }}</span>
        </span>
        <span class="mt-auto min-w-0">
          <b class="block truncate text-base font-semibold">{{ w.Nome }}</b>
          <small class="text-[13px] opacity-75">
            {{ eur(w.Budget || 0, { corto: true }) }} al mese
            <template v-if="conteggi[w.documentId] != null"> · {{ conteggi[w.documentId] }} transazioni</template>
          </small>
        </span>
      </button>
      <button
        type="button"
        class="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-[20px] text-testo2 shadow-[inset_0_0_0_1.5px_var(--color-bordo-forte)] hover:text-testo"
        @click="Object.assign(nuovo, { aperto: true, nome: '', budget: null })"
      >
        <i class="ph-bold ph-plus text-[22px]" />Nuovo portafoglio
      </button>
    </div>

    <form v-if="nuovo.aperto" class="mt-5 rounded-[20px] bg-campo p-5" @submit.prevent="crea">
      <div class="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div>
          <label class="etichetta" for="n-nome">Nome del nuovo portafoglio</label>
          <input id="n-nome" v-model="nuovo.nome" class="campo rounded-full! bg-card!" maxlength="40" autofocus />
        </div>
        <div>
          <label class="etichetta" for="n-budget">Budget mensile</label>
          <InputNumber v-model="nuovo.budget" inputId="n-budget" mode="currency" currency="EUR" locale="it-IT" :min="0" fluid />
        </div>
      </div>
      <p class="mt-3 text-[12.5px] text-testo2">Nasce con il suo salvadanaio “Risparmi mensili”.</p>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="pill-btn pill-btn--ghost h-11! px-5!" @click="nuovo.aperto = false">Annulla</button>
        <button type="submit" class="pill-btn pill-btn--cream h-11! px-5!" :disabled="nuovo.salvando || !nuovo.nome.trim()">Crea</button>
      </div>
    </form>
  </section>

  <section v-if="sel" class="panel">
    <h3 class="mb-5 truncate text-[17px] font-semibold tracking-[-0.015em]">Dettagli di {{ sel.Nome }}</h3>
    <form novalidate @submit.prevent="salva">
      <div class="grid gap-5 md:grid-cols-2">
        <div>
          <label class="etichetta" for="w-nome">Nome</label>
          <input id="w-nome" v-model="form.nome" class="campo rounded-full!" maxlength="40" autocomplete="off" />
        </div>
        <div>
          <label class="etichetta" for="w-budget">Budget mensile</label>
          <InputNumber v-model="form.budget" inputId="w-budget" mode="currency" currency="EUR" locale="it-IT" :min="0" fluid />
        </div>
      </div>
      <div class="mt-5 flex flex-wrap items-center gap-3 rounded-[14px] bg-fondo px-5 py-4 text-[13.5px]">
        <span>
          Categorie di spesa <b class="num font-medium">{{ eur(budgetCategorie, { corto: true }) }}</b> su
          {{ eur(Number(form.budget) || 0, { corto: true }) }} ·
          <span :class="liberi < 0 ? 'text-fg-avviso' : 'text-testo2'">
            {{ liberi < 0 ? `oltre di ${eur(-liberi, { corto: true })}` : `liberi ${eur(liberi, { corto: true })}` }}
          </span>
        </span>
        <span class="bar min-w-[120px] flex-1">
          <span
            :class="{ 'bg-arancio!': liberi < 0 }"
            :style="{ width: `${Math.min(100, (budgetCategorie / (Number(form.budget) || 1)) * 100)}%` }"
          />
        </span>
      </div>

      <label class="mt-6 flex cursor-pointer items-center justify-between gap-5">
        <span>
          <b class="block text-[15px] font-medium">Escludi dalle statistiche</b>
          <small class="mt-0.5 block max-w-[56ch] text-[13px] text-testo2">
            Resta visibile in Home, ma esce da export, analisi e avvisi. Utile per promemoria di scadenze come mutuo o IMU, che
            non sono spesa corrente.
          </small>
        </span>
        <Interruttore :modelValue="!!sel.escludiDaStatistiche" etichetta="Escludi dalle statistiche" @update:modelValue="cambiaEsclusione" />
      </label>

      <div class="mt-8 flex flex-col-reverse items-stretch justify-between gap-2 sm:flex-row sm:items-center">
        <button
          v-if="walletStore.wallets.length > 1 && mioWallet"
          type="button"
          class="inline-flex h-10 items-center gap-1.5 self-start rounded-full px-3 text-sm font-medium text-fg-avviso hover:bg-campo"
          @click="elimina"
        >
          <i class="ph-bold ph-trash" />Elimina portafoglio
        </button>
        <span v-else class="text-[12.5px] text-testo2">
          {{ walletStore.wallets.length <= 1 ? "È il tuo unico portafoglio: non si può eliminare." : "Solo chi l'ha creato può eliminarlo." }}
        </span>
        <button type="submit" class="pill-btn pill-btn--cream h-12! self-end" :disabled="salvando || !modificato">Salva</button>
      </div>
    </form>
  </section>
  <p v-else class="vuoto">Nessun portafoglio: creane uno per cominciare.</p>

  <Condivisione v-if="sel" />
</template>

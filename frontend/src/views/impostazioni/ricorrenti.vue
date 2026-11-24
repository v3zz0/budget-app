<script setup>
import { computed, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import { aggiornaRicorrente, elencaRicorrenti, eliminaTransazione, interrompiRicorrente } from "@/services/transazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { statoSalvadanaio } from "@/services/salvadanaio.js";
import { eur } from "@/utils/formato.js";
import { nomeMese } from "@/utils/budget.js";
import { dataRicorrenza } from "@/utils/impostazioni.js";
import { giornoRicorrenza, prossimaScadenza } from "@/utils/ricorrenza.js";

const route = useRoute();
const confirm = useConfirm();
const toast = useToast();
const walletStore = useWalletStore();
const avviso = (severity, summary, detail) => toast.add({ severity, summary, detail, life: 3500 });

const lista = ref([]);
const loading = ref(false);
const errore = ref(null);
const aperta = ref(null);
const bozza = reactive({ importo: null, giorno: 1, salvando: false });

let ultima = 0;
async function carica(walletId = walletStore.walletId) {
  const n = ++ultima;
  errore.value = null;
  if (!walletId) return (lista.value = []);
  loading.value = true;
  try {
    // La cartella dei versamenti automatici arriva dallo stato del salvadanaio:
    // le cartelle non hanno lettura REST, passano solo da /api/salvadanai.
    const [dati, stato] = await Promise.all([elencaRicorrenti(walletId), statoSalvadanaio(walletId).catch(() => null)]);
    const cartellaDi = new Map((stato?.cartelle || []).flatMap((c) => c.automatici.map((a) => [a.id, { Nome: c.nome, Emoji: c.emoji }])));
    if (n === ultima) lista.value = dati.map((t) => ({ ...t, salvadanaio: cartellaDi.get(t.documentId) || null }));
  } catch (e) {
    if (n === ultima) errore.value = erroreLeggibile(e);
  } finally {
    if (n === ultima) loading.value = false;
  }
}
watch(() => walletStore.walletId, (id) => ((aperta.value = null), carica(id)), { immediate: true });

// Link di una notifica di scadenza (?scadenza=<id>): apre quella riga.
watch([() => route.query.scadenza, lista], ([id]) => {
  if (typeof id === "string" && lista.value.some((t) => t.documentId === id) && aperta.value !== id) {
    apri(lista.value.find((t) => t.documentId === id));
  }
});

// Ordinate per giorno del mese
const voci = computed(() =>
  lista.value
    .map((t) => ({
      t, giorno: giornoRicorrenza(t), prossima: prossimaScadenza(t), entrata: t.categorie?.Tipo === "entrata",
      // versamento automatico nel salvadanaio (§16): importo neutro, né entrata né uscita
      salv: t.categorie?.Tipo === "salvadanaio",
    }))
    .sort((a, b) => a.giorno - b.giorno),
);
const totale = (entrata) =>
  voci.value.filter((v) => !v.salv && v.entrata === entrata && !v.t.InPausa).reduce((s, v) => s + (Number(v.t.Importo) || 0), 0);
const nelSalvadanaio = computed(() => voci.value.filter((v) => v.salv && !v.t.InPausa).reduce((s, v) => s + (Number(v.t.Importo) || 0), 0));
const nome = (v) => (v.salv ? `Salvadanaio · ${v.t.salvadanaio?.Nome || "eliminato"}` : v.t.Descrizione || v.t.categorie?.Nome);
const corto = (d) => `${d.getDate()} ${nomeMese(d.getMonth() + 1).slice(0, 3).toLowerCase()}`;

function apri(t) {
  if (aperta.value === t.documentId) return (aperta.value = null);
  aperta.value = t.documentId;
  Object.assign(bozza, { importo: Number(t.Importo) || null, giorno: giornoRicorrenza(t) });
}

async function salva(t) {
  const giorno = Math.round(Number(bozza.giorno));
  if (!(bozza.importo > 0)) return avviso("warn", "L'importo deve essere maggiore di zero");
  if (!(giorno >= 1 && giorno <= 31)) return avviso("warn", "Il giorno va da 1 a 31");
  bozza.salvando = true;
  try {
    await aggiornaRicorrente(t.documentId, { Importo: bozza.importo, RicorrenzaTemporale: dataRicorrenza(giorno) });
    aperta.value = null;
    await carica();
    avviso("success", "Ricorrente aggiornata", "Le modifiche valgono dal mese prossimo.");
  } catch (e) {
    avviso("error", "Non salvata", erroreLeggibile(e));
  } finally {
    bozza.salvando = false;
  }
}

async function pausa(t) {
  try {
    await aggiornaRicorrente(t.documentId, { InPausa: !t.InPausa });
    await carica();
    avviso("success", t.InPausa ? "Ricorrente riattivata" : "Ricorrente in pausa");
  } catch (e) {
    avviso("error", "Errore", erroreLeggibile(e));
  }
}

function interrompi(t) {
  const salv = t.categorie?.Tipo === "salvadanaio";
  confirm.require({
    header: `Interrompere “${salv ? `Salvadanaio · ${t.salvadanaio?.Nome || ""}` : t.Descrizione || t.categorie?.Nome}”?`,
    message: salv
      ? "Non verserà più ogni mese. I soldi già versati restano nel salvadanaio."
      : "Non verrà più registrata ogni mese. Le transazioni già registrate restano.",
    acceptLabel: "Interrompi",
    icon: "ph-stop-circle",
    accept: async () => {
      try {
        // il versamento automatico è solo un promemoria del server: si toglie
        await (salv ? eliminaTransazione(t.documentId) : interrompiRicorrente(t.documentId));
        aperta.value = null;
        await carica();
      } catch (e) {
        avviso("error", "Errore", erroreLeggibile(e));
      }
    },
  });
}
</script>

<template>
  <section class="panel reveal">
    <h2 class="text-[28px] leading-[1.05] font-medium tracking-[-0.04em] sm:text-[34px]">Transazioni ricorrenti</h2>
    <p class="mt-3 max-w-[60ch] text-testo2">
      Si registrano da sole ogni mese, lo stesso giorno. Le crei dalla pagina Transazioni attivando “Ricorrente”.
    </p>
  </section>

  <section class="panel">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-4">
      <h3 class="text-[17px] font-semibold tracking-[-0.015em]">Ogni mese</h3>
      <router-link to="/transazioni?ricorrente=1" class="pill-btn pill-btn--ghost h-11! px-5!"><i class="ph-bold ph-plus" />Nuova ricorrente</router-link>
    </div>

    <div v-if="errore" class="box-errore">{{ errore }}</div>
    <template v-else-if="loading && !voci.length">
      <Skeleton v-for="i in 3" :key="i" height="3.5rem" borderRadius="18px" class="mb-2" />
    </template>
    <div v-else-if="!voci.length" class="px-4 py-8 text-center text-sm text-testo2">
      <i class="ph-bold ph-repeat mb-3 block text-[28px] text-testo3" />
      Nessuna transazione ricorrente in questo portafoglio.
    </div>

    <div v-else class="flex flex-col">
      <div
        v-for="({ t, giorno, prossima, entrata, salv }, i) in voci"
        :key="t.documentId"
        class="rounded-[20px]"
        :class="[aperta === t.documentId ? 'bg-campo' : i ? 'border-t border-bordo' : '']"
      >
        <button
          type="button"
          class="flex w-full items-center gap-4 rounded-[20px] py-3 text-left sm:px-3"
          :class="aperta === t.documentId ? 'px-3' : 'hover:bg-campo'"
          :aria-expanded="aperta === t.documentId"
          @click="apri(t)"
        >
          <span class="grid h-11 w-11 flex-none place-items-center rounded-full text-[22px]" :class="[aperta === t.documentId ? 'bg-card' : 'bg-campo', { 'opacity-50': t.InPausa }]">
            <Emoji :e="salv ? t.salvadanaio?.Emoji || '🐷' : t.categorie?.icona || '🔁'" />
          </span>
          <span class="min-w-0 flex-1">
            <b class="block truncate text-[15px] font-medium" :class="{ 'text-testo3': t.InPausa }">
              {{ nome({ t, salv }) }}
              <span v-if="t.InPausa" class="ml-2 rounded-full bg-campo px-2 py-0.5 align-[1px] text-xs font-normal text-testo2">in pausa</span>
            </b>
            <small class="block truncate text-[13px] text-testo2">
              {{ salv ? (t.fonte === "mensili" ? "dai Risparmi mensili" : "soldi nuovi") : t.categorie?.Nome }} · ogni {{ giorno }} del mese<template v-if="prossima"> · prossima il {{ corto(prossima) }}</template>
            </small>
          </span>
          <span class="num text-base" :class="t.InPausa ? 'text-testo3' : salv ? 'text-testo' : entrata ? 'text-fg-positivo' : 'text-fg-negativo'">
            {{ salv ? eur(Number(t.Importo)) : eur(entrata ? Number(t.Importo) : -Number(t.Importo), { segno: true }) }}
          </span>
          <i class="ph-bold ph-caret-down text-testo3 transition-transform" :class="{ 'rotate-180': aperta === t.documentId }" />
        </button>

        <div v-if="aperta === t.documentId" class="px-3 pt-2 pb-4 sm:px-5 sm:pb-5">
          <div class="grid gap-4 md:grid-cols-[2fr_1fr]">
            <div>
              <label class="etichetta" :for="`r-imp-${i}`">Importo</label>
              <InputNumber v-model="bozza.importo" :inputId="`r-imp-${i}`" mode="currency" currency="EUR" locale="it-IT" :min="0" fluid />
            </div>
            <div>
              <label class="etichetta" :for="`r-g-${i}`">Giorno del mese</label>
              <input :id="`r-g-${i}`" v-model.number="bozza.giorno" type="number" min="1" max="31" class="campo rounded-full! bg-card!" />
            </div>
          </div>
          <p class="mt-2 text-[12.5px] text-testo2">Se il mese è più corto si usa l'ultimo giorno. Le modifiche valgono dal mese successivo.</p>
          <div class="mt-5 flex flex-col-reverse items-stretch justify-between gap-2 sm:flex-row sm:items-center">
            <div class="flex flex-wrap gap-1">
              <button type="button" class="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-testo2 hover:bg-card hover:text-testo" @click="pausa(t)">
                <i class="ph-bold" :class="t.InPausa ? 'ph-play' : 'ph-pause'" />{{ t.InPausa ? "Riattiva" : "Metti in pausa" }}
              </button>
              <button type="button" class="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-fg-avviso hover:bg-card" @click="interrompi(t)">
                <i class="ph-bold ph-stop-circle" />Interrompi
              </button>
            </div>
            <div class="flex justify-end gap-2">
              <button class="pill-btn pill-btn--ghost h-11! px-5!" @click="aperta = null">Annulla</button>
              <button class="pill-btn pill-btn--cream h-11! px-5!" :disabled="bozza.salvando" @click="salva(t)">Salva</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="voci.length" class="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-bordo pt-5 text-sm text-testo2">
      <span>Entrano in automatico <b class="num font-medium text-fg-positivo">{{ eur(totale(true), { segno: true }) }}</b> al mese</span>
      <span>Escono <b class="num font-medium text-fg-negativo">{{ eur(-totale(false)) }}</b> al mese</span>
      <span v-if="nelSalvadanaio" class="basis-full">Vanno nel salvadanaio <b class="num font-medium text-testo">{{ eur(nelSalvadanaio) }}</b> al mese</span>
    </div>
  </section>
</template>

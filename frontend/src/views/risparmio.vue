<script setup>
import { computed, ref, watch } from "vue";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import { elencaSalvadanaio, salvaRisparmio } from "@/services/salvadanaio.js";
import { erroreLeggibile } from "@/services/api.js";
import { avanzato, chiaveMese, euro, nomeMese, spostaMese } from "@/utils/budget.js";
import { token } from "@/utils/tokens.js";

const toast = useToast();
const walletStore = useWalletStore();

const voci = ref([]); // cronologico, ultimi 24 mesi
const loading = ref(false);
const errore = ref(null);
const salvataggio = ref(false);
const importo = ref(null);

const oggi = new Date();
const adesso = { anno: oggi.getFullYear(), mese: oggi.getMonth() + 1 };
const cercaMese = ({ anno, mese }) => voci.value.find((v) => v.mese.startsWith(chiaveMese(anno, mese)));

const meseCorrente = computed(() => cercaMese(adesso));
// Il mese PRECEDENTE, cioè l'ultimo chiuso dal cron (non l'ultimo della lista:
// quello è il mese corrente, già editabile nella card in alto).
const mesePrecedenteMese = spostaMese(adesso, -1);
const mesePrecedente = computed(() => cercaMese(mesePrecedenteMese));
const avanzo = computed(() => avanzato(mesePrecedente.value));
const totaleStorico = computed(() => voci.value.reduce((s, v) => s + (v.risparmiato || 0), 0));
const ultimi6 = computed(() => voci.value.slice(-6));
const percentualeSpesa = computed(() => {
  const m = mesePrecedente.value;
  return m?.budgetAllocato > 0 ? Math.min((m.speso / m.budgetAllocato) * 100, 100) : 0;
});

// Solo l'ultima richiesta può scrivere: cambiando portafoglio in fretta una
// risposta lenta non sovrascrive quella nuova.
let ultima = 0;
async function carica(walletId) {
  const n = ++ultima;
  errore.value = null;
  if (!walletId) {
    voci.value = [];
    importo.value = null;
    return;
  }
  loading.value = true;
  try {
    const lista = await elencaSalvadanaio(walletId);
    if (n !== ultima) return;
    voci.value = lista;
    importo.value = meseCorrente.value?.risparmiato ?? null;
  } catch (e) {
    if (n === ultima) errore.value = erroreLeggibile(e);
  } finally {
    if (n === ultima) loading.value = false;
  }
}
watch(() => walletStore.walletId, carica, { immediate: true });

async function salva() {
  salvataggio.value = true;
  try {
    const record = await salvaRisparmio(walletStore.walletId, meseCorrente.value, importo.value ?? 0);
    // Sostituzione in place, senza ricaricare la lista
    const i = voci.value.findIndex((v) => v.documentId === record.documentId);
    if (i >= 0) voci.value[i] = { ...voci.value[i], ...record };
    else voci.value = [...voci.value, record].sort((a, b) => a.mese.localeCompare(b.mese));
    toast.add({ severity: "success", summary: "Risparmio salvato", life: 2500 });
  } catch (e) {
    toast.add({ severity: "error", summary: "Errore", detail: erroreLeggibile(e), life: 4000 });
  } finally {
    salvataggio.value = false;
  }
}

const grafico = computed(() => {
  const verde = token("positivo"); // esadecimale a 6 cifre: "73" = ~45% di opacità
  const ultimo = ultimi6.value.length - 1;
  return {
    labels: ultimi6.value.map((v) => nomeMese(Number(v.mese.slice(5, 7))).slice(0, 3)),
    datasets: [
      {
        data: ultimi6.value.map((v) => v.risparmiato || 0),
        backgroundColor: ultimi6.value.map((_, i) => (i === ultimo ? verde : `${verde}73`)),
        borderRadius: 6,
        maxBarThickness: 36,
      },
    ],
  };
});
const opzioniGrafico = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => euro(c.parsed.y) } } },
  scales: {
    x: { grid: { display: false }, border: { display: false }, ticks: { color: token("testo2") } },
    y: { display: false, beginAtZero: true, suggestedMax: Math.max(...ultimi6.value.map((v) => v.risparmiato || 0), 70) * 1.4 },
  },
}));
</script>

<template>
  <div class="flex flex-col gap-4 px-4 pt-6">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-testo2">Obiettivo</p>
      <h1 class="text-3xl font-bold text-testo">Salvadanaio</h1>
    </div>

    <div v-if="errore" class="rounded-xl border border-errore/40 bg-errore/15 p-4 text-errore-testo">{{ errore }}</div>

    <template v-else-if="loading">
      <Skeleton height="7rem" borderRadius="20px" />
      <Skeleton height="9rem" borderRadius="20px" />
      <Skeleton height="14rem" borderRadius="20px" />
    </template>

    <p v-else-if="!walletStore.selectedWallet" class="py-10 text-center text-testo2">
      Nessun portafoglio. Creane uno in Impostazioni.
    </p>

    <template v-else>
      <!-- Risparmio del mese: lo decide l'utente, il cron non lo tocca -->
      <form class="rounded-[20px] border border-bordo bg-card p-5" @submit.prevent="salva">
        <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
          <i class="pi pi-wallet mr-2" />Risparmio {{ nomeMese(adesso.mese) }} {{ adesso.anno }}
        </p>
        <div class="mt-3 flex items-center gap-3">
          <InputNumber
            v-model="importo"
            :min="0"
            :maxFractionDigits="2"
            locale="it-IT"
            suffix=" €"
            placeholder="0 €"
            aria-label="Risparmio del mese"
            fluid
            :pt="{ pcInputText: { root: { class: 'text-2xl! font-bold!' } } }"
          />
          <Button type="submit" label="Salva" :loading="salvataggio" />
        </div>
      </form>

      <!-- Quanto è avanzato il mese scorso: una proposta, non un automatismo -->
      <button
        v-if="avanzo"
        type="button"
        class="flex items-center gap-3 rounded-2xl border border-positivo/35 bg-positivo/10 p-4 text-left"
        @click="importo = Math.round(avanzo)"
      >
        <i class="pi pi-wallet text-positivo" />
        <span class="flex-1">
          <span class="block text-sm font-semibold text-testo">
            A {{ nomeMese(mesePrecedenteMese.mese).toLowerCase() }} hai risparmiato {{ euro(avanzo) }}
          </span>
          <span class="block text-xs text-testo2">Tocca per metterli nel salvadanaio</span>
        </span>
        <i class="pi pi-arrow-right text-positivo" />
      </button>

      <!-- Totale storico -->
      <div class="rounded-[20px] border border-accent/30 bg-positivo/10 p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-positivo">
          <i class="pi pi-chart-line mr-2" />Totale storico
        </p>
        <p class="mt-3 text-5xl font-bold text-testo">
          {{ Math.round(totaleStorico) }}<span class="ml-1.5 text-2xl font-light text-positivo">€</span>
        </p>
        <p class="mt-1 text-sm text-testo2">{{ walletStore.selectedWallet.Nome }}</p>
      </div>

      <!-- Trend ultimi 6 mesi -->
      <div v-if="ultimi6.length" class="rounded-[20px] border border-bordo bg-card p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-testo2">Trend mensile</p>
        <Chart type="bar" :data="grafico" :options="opzioniGrafico" class="mt-5 h-44" />
      </div>

      <!-- Dettaglio del mese chiuso -->
      <div v-if="mesePrecedente" class="rounded-[20px] border border-bordo bg-card p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-testo2">
          Dettaglio {{ nomeMese(mesePrecedenteMese.mese) }} {{ mesePrecedenteMese.anno }}
        </p>
        <dl class="mt-4 flex flex-col gap-2">
          <div class="flex justify-between">
            <dt class="text-testo2">Budget</dt>
            <dd class="font-semibold text-testo">{{ euro(mesePrecedente.budgetAllocato) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-testo2">Speso</dt>
            <dd class="font-semibold text-avviso">{{ euro(mesePrecedente.speso) }}</dd>
          </div>
        </dl>
        <div class="mt-3 h-1.5 overflow-hidden rounded bg-campo">
          <div class="h-full bg-avviso" :style="{ width: percentualeSpesa + '%' }" />
        </div>
        <div class="mt-2 flex justify-between text-xs">
          <span class="text-testo2">{{ Math.round(percentualeSpesa) }}% del budget</span>
          <span class="font-semibold text-positivo">Risparmiato: {{ euro(mesePrecedente.risparmiato || 0) }}</span>
        </div>
      </div>

      <p v-if="!voci.length" class="py-6 text-center text-testo2">
        Nessun dato disponibile.<br />I mesi vengono chiusi in automatico a fine mese: il risparmio del mese in corso lo
        inserisci tu qui sopra.
      </p>
    </template>
  </div>
</template>

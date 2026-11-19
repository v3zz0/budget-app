<script setup>
import { computed, ref, watch } from "vue";
import { useWalletStore } from "@/stores/wallet.js";
import { caricaAnno } from "@/services/anno.js";
import { erroreLeggibile } from "@/services/api.js";
import { euro, nomeMese } from "@/utils/budget.js";
import { token } from "@/utils/tokens.js";

const walletStore = useWalletStore();

const anno = ref(new Date().getFullYear());
const riepilogo = ref(null);
const mancanti = ref(0);
const loading = ref(false);
const errore = ref(null);

let ultima = 0; // solo l'ultima richiesta scrive
async function carica() {
  const n = ++ultima;
  errore.value = null;
  if (!walletStore.walletId) {
    riepilogo.value = null;
    return;
  }
  loading.value = true;
  try {
    const esito = await caricaAnno(walletStore.walletId, anno.value);
    if (n !== ultima) return;
    riepilogo.value = esito.riepilogo;
    mancanti.value = esito.mancanti;
  } catch (e) {
    if (n === ultima) errore.value = erroreLeggibile(e);
  } finally {
    if (n === ultima) loading.value = false;
  }
}
watch(() => walletStore.walletId, carica, { immediate: true });

const cambiaAnno = (passo) => {
  anno.value += passo;
  carica();
};

const meseCorrente = new Date().getMonth();
const grafico = computed(() => {
  const accent = token("accent"); // esadecimale a 6 cifre: "73" = ~45% di opacità
  return {
    // solo le iniziali: dodici etichette intere non ci stanno su un telefono
    labels: Array.from({ length: 12 }, (_, i) => nomeMese(i + 1)[0]),
    datasets: [
      {
        data: riepilogo.value?.perMese ?? [],
        backgroundColor: Array.from({ length: 12 }, (_, i) => (i === meseCorrente && anno.value === new Date().getFullYear() ? accent : `${accent}73`)),
        borderRadius: 4,
        maxBarThickness: 24,
      },
    ],
  };
});
const opzioniGrafico = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: { title: (c) => nomeMese(c[0].dataIndex + 1), label: (c) => euro(c.parsed.y) } },
  },
  scales: {
    x: { grid: { display: false }, border: { display: false }, ticks: { color: token("testo2"), maxRotation: 0 } },
    y: { display: false, beginAtZero: true, suggestedMax: Math.max(...(riepilogo.value?.perMese ?? [0]), 70) * 1.4 },
  },
}));
</script>

<template>
  <div class="flex flex-col gap-4 px-4 pt-6">
    <div class="flex items-end justify-between gap-2">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-testo2">
          {{ walletStore.selectedWallet?.Nome || "Portafoglio" }}
        </p>
        <h1 class="text-3xl font-bold text-testo">Riepilogo anno</h1>
      </div>
      <div class="flex items-center">
        <Button icon="pi pi-chevron-left" text rounded severity="secondary" aria-label="Anno precedente" @click="cambiaAnno(-1)" />
        <span class="min-w-14 text-center text-xl font-bold text-testo">{{ anno }}</span>
        <Button icon="pi pi-chevron-right" text rounded severity="secondary" aria-label="Anno successivo" @click="cambiaAnno(1)" />
      </div>
    </div>

    <div v-if="errore" class="rounded-xl border border-errore/40 bg-errore/15 p-4 text-errore-testo">{{ errore }}</div>

    <template v-else-if="loading">
      <Skeleton height="7rem" borderRadius="20px" />
      <Skeleton height="12rem" borderRadius="20px" />
    </template>

    <p v-else-if="!riepilogo || riepilogo.vuoto" class="py-16 text-center text-testo2">
      Nessuna spesa registrata nel {{ anno }}.
    </p>

    <template v-else>
      <!-- Dati parziali: il totale sarebbe più basso del vero, va detto -->
      <div v-if="mancanti > 0" class="flex gap-3 rounded-xl border border-errore/40 bg-errore/15 p-3 text-sm text-errore-testo">
        <i class="pi pi-exclamation-triangle mt-0.5" />
        Mancano {{ mancanti }} transazioni: il totale qui sotto è più basso di quello reale. Riprova, o segnalalo se si ripete.
      </div>

      <div class="rounded-[20px] border border-bordo bg-card p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.15em] text-testo2">Speso nell'anno</p>
        <p class="mt-1 text-4xl font-bold text-testo">{{ euro(riepilogo.speso) }}</p>
        <p v-if="riepilogo.budgetStimato > 0" class="mt-1.5 text-sm text-testo2">
          su {{ euro(riepilogo.budgetStimato) }} di budget stimato ({{ riepilogo.mesiConsiderati }} mesi)
        </p>
      </div>

      <div class="rounded-[20px] border border-bordo bg-card px-3 pb-2 pt-4">
        <Chart type="bar" :data="grafico" :options="opzioniGrafico" class="h-44" />
      </div>

      <p class="mt-2 px-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-testo2">Per categoria</p>
      <div
        v-for="c in riepilogo.categorie.filter((c) => c.speso > 0 || c.budgetStimato > 0)"
        :key="c.documentId"
        class="rounded-xl border border-bordo bg-card p-3.5"
      >
        <div class="flex items-center gap-2.5">
          <span v-if="c.icona" class="text-lg">{{ c.icona }}</span>
          <span class="flex-1 truncate text-sm font-semibold text-testo">{{ c.nome }}</span>
          <!-- Sopra la stima: rosso e anche il segno "oltre" a parole, non solo il colore -->
          <span class="font-bold" :class="c.oltreStima ? 'text-errore-testo' : 'text-testo'">{{ euro(c.speso) }}</span>
        </div>
        <template v-if="c.budgetStimato > 0">
          <div class="mt-2 h-[5px] overflow-hidden rounded bg-campo">
            <div class="h-full" :class="c.oltreStima ? 'bg-errore' : 'bg-accent'" :style="{ width: Math.min(c.percentuale, 1) * 100 + '%' }" />
          </div>
          <p class="mt-1 text-[11px] text-testo2">
            stima budget {{ euro(c.budgetStimato) }}<template v-if="c.oltreStima"> · oltre di {{ euro(c.speso - c.budgetStimato) }}</template>
          </p>
        </template>
      </div>

      <!-- Perché il budget annuo è una stima: un numero derivato che si
           presenta come rilevato è peggio di un numero assente -->
      <p class="px-1 text-[11px] text-testo2">
        Lo speso è esatto. Il budget annuo è una stima: l'app conserva solo il budget attuale di ogni categoria, non lo
        storico, quindi se durante l'anno l'hai cambiato la stima non lo riflette.
      </p>
    </template>
  </div>
</template>

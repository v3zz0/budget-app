<script setup>
import { computed, ref, watch } from "vue";
import { useWalletStore } from "@/stores/wallet.js";
import { caricaAnno } from "@/services/anno.js";
import { erroreLeggibile } from "@/services/api.js";
import { nomeMese } from "@/utils/budget.js";
import { eur } from "@/utils/formato.js";
const euro = (v) => eur(v, { corto: true });
import { token } from "@/utils/tokens.js";
import { temaChiaro } from "@/tema.js";

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

// Entrate e uscite per mese, due serie coi colori di significato
const grafico = computed(() => ({
  _tema: temaChiaro.value, // i colori del canvas si rileggono cambiando tema
  // solo le iniziali: dodici etichette intere non ci stanno su un telefono
  labels: Array.from({ length: 12 }, (_, i) => nomeMese(i + 1)[0]),
  datasets: [
    { label: "Entrate", data: riepilogo.value?.entratePerMese ?? [], backgroundColor: token("salvia"), borderRadius: 4, maxBarThickness: 18 },
    { label: "Uscite", data: riepilogo.value?.perMese ?? [], backgroundColor: token("arancio"), borderRadius: 4, maxBarThickness: 18 },
  ],
}));
const opzioniGrafico = computed(() => ({
  _tema: temaChiaro.value,
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: { title: (c) => nomeMese(c[0].dataIndex + 1), label: (c) => `${c.dataset.label} ${euro(c.parsed.y)}` } },
  },
  scales: {
    x: { grid: { display: false }, border: { display: false }, ticks: { color: token("testo2"), maxRotation: 0 } },
    y: { display: false, beginAtZero: true },
  },
}));
const mesi = computed(() =>
  Array.from({ length: 12 }, (_, i) => {
    const entrate = riepilogo.value?.entratePerMese?.[i] ?? 0;
    const uscite = riepilogo.value?.perMese?.[i] ?? 0;
    return { mese: i + 1, entrate, uscite, saldo: Math.round((entrate - uscite) * 100) / 100 };
  }).filter((m) => m.entrate || m.uscite),
);
</script>

<template>
  <div>
    <div class="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
      <div>
        <router-link to="/" class="eyebrow inline-flex items-center gap-1.5 hover:text-testo"><i class="ph-bold ph-arrow-left" />{{ walletStore.selectedWallet?.Nome || "Home" }}</router-link>
        <h1 class="display">Anno <span class="text-testo3">{{ anno }}</span></h1>
      </div>
      <div class="flex gap-2">
        <button class="circle-btn" aria-label="Anno precedente" @click="cambiaAnno(-1)"><i class="ph-bold ph-caret-left" /></button>
        <button class="circle-btn" aria-label="Anno successivo" @click="cambiaAnno(1)"><i class="ph-bold ph-caret-right" /></button>
      </div>
    </div>

    <div v-if="errore" class="box-errore">{{ errore }}</div>
    <template v-else-if="loading">
      <Skeleton height="9rem" borderRadius="28px" class="mb-3" />
      <Skeleton height="16rem" borderRadius="28px" />
    </template>
    <p v-else-if="!riepilogo || (riepilogo.vuoto && !riepilogo.entrate)" class="vuoto">Nessun movimento registrato nel {{ anno }}.</p>

    <template v-else>
      <!-- Dati parziali: il totale sarebbe più basso del vero, va detto -->
      <div v-if="mancanti > 0" class="box-errore mb-3 flex gap-3">
        <i class="ph-bold ph-warning mt-0.5" />Mancano {{ mancanti }} transazioni: i totali qui sotto sono più bassi di quelli reali.
      </div>

      <section class="mb-3 grid grid-cols-3 gap-2 sm:gap-3">
        <div class="blocco min-w-0 bg-salvia"><small class="text-[13px] font-medium">Entrate</small><b class="mt-4 block truncate text-[clamp(17px,4.6vw,40px)] leading-none font-normal"><Euro :v="riepilogo.entrate" corto /></b></div>
        <div class="blocco min-w-0 bg-arancio"><small class="text-[13px] font-medium">Uscite</small><b class="mt-4 block truncate text-[clamp(17px,4.6vw,40px)] leading-none font-normal"><Euro :v="riepilogo.speso" corto /></b></div>
        <div class="blocco min-w-0 bg-crema"><small class="text-[13px] font-medium">Saldo</small><b class="mt-4 block truncate text-[clamp(17px,4.6vw,40px)] leading-none font-normal"><Euro :v="riepilogo.entrate - riepilogo.speso" corto /></b></div>
      </section>

      <section class="panel mb-3">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="panel-title">Mese per mese</h2>
          <div class="flex gap-4 text-[13px] text-testo2">
            <span class="inline-flex items-center gap-2"><i class="h-2.5 w-2.5 rounded-[3px] bg-salvia" />Entrate</span>
            <span class="inline-flex items-center gap-2"><i class="h-2.5 w-2.5 rounded-[3px] bg-arancio" />Uscite</span>
          </div>
        </div>
        <Chart type="bar" :data="grafico" :options="opzioniGrafico" class="h-48" />
        <div class="mt-4">
          <div class="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] gap-2 pb-2 text-[12.5px] font-medium text-testo2">
            <span>Mese</span><span class="text-right">Entrate</span><span class="text-right">Uscite</span><span class="text-right">Saldo</span>
          </div>
          <div v-for="m in mesi" :key="m.mese" class="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] gap-2 border-t border-bordo py-2.5 text-[14px]">
            <span class="truncate">{{ nomeMese(m.mese) }}</span>
            <span class="num text-right text-fg-positivo">{{ euro(m.entrate) }}</span>
            <span class="num text-right text-fg-negativo">{{ euro(m.uscite) }}</span>
            <span class="num text-right font-medium">{{ euro(m.saldo) }}</span>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h2 class="panel-title">Uscite per categoria</h2>
          <p v-if="riepilogo.budgetStimato > 0" class="text-sm text-testo2">su {{ euro(riepilogo.budgetStimato) }} di budget stimato ({{ riepilogo.mesiConsiderati }} mesi)</p>
        </div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          <article v-for="c in riepilogo.categorie.filter((c) => c.speso > 0 || c.budgetStimato > 0)" :key="c.documentId" class="flex flex-col gap-3 rounded-[20px] p-5" :class="c.oltreStima ? 'bg-arancio text-inchiostro' : 'bg-campo'">
            <div class="flex items-center gap-3">
              <span class="grid h-10 w-10 flex-none place-items-center rounded-full text-xl" :class="c.oltreStima ? 'bg-inchiostro-velo' : 'bg-card'"><Emoji :e="c.icona || '🏷️'" /></span>
              <b class="min-w-0 flex-1 truncate text-[15px] font-medium">{{ c.nome }}</b>
            </div>
            <strong class="num text-[26px] leading-none font-normal">{{ euro(c.speso) }}</strong>
            <template v-if="c.budgetStimato > 0">
              <div class="bar h-1.5!" :class="{ 'bg-inchiostro-velo!': c.oltreStima }">
                <span :class="c.oltreStima ? 'bg-inchiostro!' : 'bg-salvia!'" :style="{ width: Math.min(c.percentuale, 1) * 100 + '%' }" />
              </div>
              <small class="text-[13px]" :class="{ 'text-testo2': !c.oltreStima }">
                stima {{ euro(c.budgetStimato) }}<template v-if="c.oltreStima"> · oltre di {{ euro(c.speso - c.budgetStimato) }}</template>
              </small>
            </template>
          </article>
        </div>
        <!-- Perché il budget annuo è una stima: un numero derivato che si
             presenta come rilevato è peggio di un numero assente -->
        <p class="mt-5 text-[12.5px] text-testo2">
          Lo speso è esatto. Il budget annuo è una stima: l'app conserva solo il budget attuale di ogni categoria, non lo storico.
        </p>
      </section>
    </template>
  </div>
</template>

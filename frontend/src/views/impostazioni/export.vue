<script setup>
import { computed, ref, watch } from "vue";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import { caricaRighe } from "@/services/transazioniQuery.js";
import { erroreLeggibile } from "@/services/api.js";
import { chiaveMese, nomeMese, primoDelMese, spostaMese, ultimoDelMese } from "@/utils/budget.js";
import { COLONNE, generaCsv } from "@/utils/csv.js";
import { scaricaFile } from "@/utils/file.js";

const toast = useToast();
const walletStore = useWalletStore();

const PERIODI = [
  { id: "tutto", icona: "ph-infinity", titolo: "Tutto lo storico", sotto: "Ogni transazione mai registrata" },
  { id: "anno", icona: "ph-calendar", titolo: "Un anno", sotto: "Dal 1° gennaio al 31 dicembre" },
  { id: "mese", icona: "ph-calendar-blank", titolo: "Un mese", sotto: "Un mese solo" },
];
const oggi = new Date();
const periodo = ref("mese");
const sel = ref({ anno: oggi.getFullYear(), mese: oggi.getMonth() + 1 });

function sposta(passo) {
  sel.value = periodo.value === "anno" ? { ...sel.value, anno: sel.value.anno + passo } : spostaMese(sel.value, passo);
}
const etichetta = computed(() =>
  periodo.value === "anno" ? `${sel.value.anno}` : `${nomeMese(sel.value.mese)} ${sel.value.anno}`,
);
const intervallo = computed(() => {
  const { anno, mese } = sel.value;
  if (periodo.value === "anno") return { dal: `${anno}-01-01`, al: `${anno}-12-31` };
  if (periodo.value === "mese") return { dal: primoDelMese(anno, mese), al: ultimoDelMese(anno, mese) };
  return {};
});
const nomeFile = computed(() =>
  periodo.value === "tutto"
    ? "budget_storico.csv"
    : periodo.value === "anno"
      ? `budget_${sel.value.anno}.csv`
      : `budget_${chiaveMese(sel.value.anno, sel.value.mese)}.csv`,
);

// Portafogli fuori dalle statistiche: promemoria di scadenze, non spesa corrente.
const esclusi = computed(() => walletStore.wallets.filter((w) => w.escludiDaStatistiche));

// Anteprima: si scaricano le righe del periodo scelto (sono le stesse dell'export).
const anteprima = ref(null);
const caricando = ref(false);
const errore = ref("");
let ultima = 0;
watch(
  [periodo, sel, () => walletStore.wallets.length],
  async () => {
    const n = ++ultima;
    caricando.value = true;
    errore.value = "";
    try {
      const { righe, totale } = await caricaRighe(intervallo.value);
      if (n !== ultima) return;
      const idEsclusi = new Set(esclusi.value.map((w) => w.documentId));
      const incluse = righe.filter((r) => !idEsclusi.has(r.walletId));
      anteprima.value = {
        righe: incluse,
        mancanti: Math.max(totale - righe.length, 0),
        portafogli: new Set(incluse.map((r) => r.walletId)).size,
        escluse: righe.length - incluse.length,
      };
    } catch (e) {
      if (n === ultima) errore.value = erroreLeggibile(e);
    } finally {
      if (n === ultima) caricando.value = false;
    }
  },
  { immediate: true, deep: true },
);

const frase = computed(() => {
  const a = anteprima.value;
  if (!a) return "";
  const per = periodo.value === "tutto" ? "in tutto lo storico" : `per ${etichetta.value.toLowerCase()}`;
  if (!a.righe.length) return `Nessuna transazione ${per}.`;
  return `${a.righe.length} ${a.righe.length === 1 ? "transazione" : "transazioni"} ${per}, da ${a.portafogli} ${a.portafogli === 1 ? "portafoglio" : "portafogli"}.`;
});

function esporta() {
  const a = anteprima.value;
  if (!a?.righe.length) return;
  scaricaFile(nomeFile.value, generaCsv(a.righe));
  // Un export incompleto deve dirlo: un file che sembra completo e non lo è
  // porta a conclusioni sbagliate senza dare nessun segnale.
  if (a.mancanti) {
    toast.add({ severity: "error", summary: `Attenzione: mancano ${a.mancanti} righe rispetto al totale del server`, life: 8000 });
  } else {
    toast.add({ severity: "success", summary: `${a.righe.length} transazioni esportate`, life: 3000 });
  }
}
</script>

<template>
  <section class="panel reveal">
    <h2 class="text-[28px] leading-[1.05] font-medium tracking-[-0.04em] sm:text-[34px]">Esporta dati</h2>
    <p class="mt-3 max-w-[60ch] text-testo2">
      Un file CSV con una riga per transazione, da aprire con Excel, Numbers o Google Fogli. Comprende tutti i portafogli.
    </p>
  </section>

  <section class="panel">
    <h3 id="t-per" class="mb-5 flex items-center gap-3 text-[17px] font-semibold tracking-[-0.015em]">
      <span class="grid h-7 w-7 place-items-center rounded-full bg-campo font-mono text-[13px] font-medium">1</span>Periodo
    </h3>
    <div class="grid gap-2.5 md:grid-cols-3" role="radiogroup" aria-labelledby="t-per">
      <button
        v-for="p in PERIODI"
        :key="p.id"
        type="button"
        role="radio"
        :aria-checked="periodo === p.id"
        class="flex items-center gap-5 rounded-[20px] p-5 text-left transition-colors md:min-h-[140px] md:flex-col md:items-start"
        :class="periodo === p.id ? 'bg-crema text-inchiostro' : 'bg-campo hover:bg-bordo'"
        @click="periodo = p.id"
      >
        <i class="ph-bold text-2xl" :class="p.icona" />
        <span class="md:mt-auto">
          <b class="block text-base font-semibold">{{ p.titolo }}</b>
          <small class="text-[13px] opacity-75">{{ p.sotto }}</small>
        </span>
      </button>
    </div>
    <div v-if="periodo !== 'tutto'" class="mt-5 flex items-center gap-2">
      <button class="circle-btn h-10! w-10! bg-campo! text-base!" aria-label="Indietro" @click="sposta(-1)"><i class="ph-bold ph-caret-left" /></button>
      <b class="min-w-0 flex-1 text-center text-[19px] font-medium tracking-[-0.03em] sm:min-w-[180px] sm:flex-none sm:text-[22px]">{{ etichetta }}</b>
      <button class="circle-btn h-10! w-10! bg-campo! text-base!" aria-label="Avanti" @click="sposta(1)"><i class="ph-bold ph-caret-right" /></button>
    </div>
  </section>

  <section class="panel">
    <h3 class="mb-5 flex items-center gap-3 text-[17px] font-semibold tracking-[-0.015em]">
      <span class="grid h-7 w-7 place-items-center rounded-full bg-campo font-mono text-[13px] font-medium">2</span>Cosa contiene
    </h3>
    <p v-if="errore" class="box-errore">{{ errore }}</p>
    <p v-else class="text-sm text-testo2" aria-live="polite">
      <template v-if="caricando">Conto le transazioni…</template>
      <template v-else>
        {{ frase }}
        <template v-if="anteprima?.escluse"> Escluse {{ anteprima.escluse }} di {{ esclusi.map((w) => w.Nome).join(", ") }} (fuori dalle statistiche).</template>
      </template>
    </p>
    <div class="mt-3 flex flex-wrap gap-1.5">
      <span
        v-for="c in COLONNE"
        :key="c"
        class="rounded-lg bg-fondo px-2.5 py-1.5 font-mono text-xs text-testo2"
        :class="{ 'text-testo! shadow-[inset_0_0_0_1px_var(--color-bordo-forte)]': c === 'tipo' }"
      >
        {{ c }}
      </span>
    </div>
    <p class="mt-3 text-[12.5px] text-testo2">Separatore “;” e importi all'italiana (1.850,00): Excel lo apre già in colonne.</p>
    <div class="mt-6 flex justify-end">
      <button class="pill-btn pill-btn--cream h-12!" :disabled="caricando || !anteprima?.righe.length" @click="esporta">
        <i class="ph-bold ph-download-simple" />Esporta CSV
      </button>
    </div>
  </section>
</template>

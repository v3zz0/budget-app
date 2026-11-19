<script setup>
import { computed, ref } from "vue";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import { caricaRighe } from "@/services/transazioniQuery.js";
import { erroreLeggibile } from "@/services/api.js";
import { primoDelMese, ultimoDelMese } from "@/utils/budget.js";
import { generaCsv } from "@/utils/csv.js";
import { scaricaFile } from "@/utils/file.js";

const toast = useToast();
const walletStore = useWalletStore();

const ambiti = [
  { id: "tutto", icona: "pi-database", titolo: "Tutto lo storico", sotto: "Ogni transazione mai registrata" },
  { id: "anno", icona: "pi-calendar", titolo: "Un anno", sotto: "Dal 1° gennaio al 31 dicembre" },
  { id: "mese", icona: "pi-calendar-plus", titolo: "Un mese", sotto: "Un mese solo" },
];
const ambito = ref("tutto");
const periodo = ref(new Date());
const inCorso = ref(false);

// Portafogli tenuti fuori dalle statistiche: promemoria di scadenze, non spesa
// corrente, sporcherebbero l'analisi. Per documentId: due portafogli possono
// chiamarsi uguale.
const esclusi = computed(() => walletStore.wallets.filter((w) => w.escludiDaStatistiche));

const anno = computed(() => periodo.value.getFullYear());
const mese = computed(() => periodo.value.getMonth() + 1);
const etichetta = computed(() => (ambito.value === "anno" ? `${anno.value}` : `${anno.value}-${String(mese.value).padStart(2, "0")}`));

const intervallo = computed(() => {
  if (ambito.value === "anno") return { dal: `${anno.value}-01-01`, al: `${anno.value}-12-31` };
  if (ambito.value === "mese") return { dal: primoDelMese(anno.value, mese.value), al: ultimoDelMese(anno.value, mese.value) };
  return {};
});
const nomeFile = computed(() => (ambito.value === "tutto" ? "budget_tutto.csv" : `budget_${etichetta.value}.csv`));

const messaggio = (severity, summary, life = 3500) => toast.add({ severity, summary, life });

async function esporta() {
  inCorso.value = true;
  try {
    const { righe, totale } = await caricaRighe(intervallo.value);
    const idEsclusi = new Set(esclusi.value.map((w) => w.documentId));
    const incluse = righe.filter((r) => !idEsclusi.has(r.walletId));
    const escluse = righe.length - incluse.length;

    if (!incluse.length) return messaggio("info", "Nessuna transazione da esportare in questo periodo");

    scaricaFile(nomeFile.value, generaCsv(incluse));

    // Un export incompleto deve dirlo: un file che sembra completo e non lo è
    // porta a conclusioni sbagliate senza dare nessun segnale.
    if (righe.length < totale) {
      messaggio("error", `Attenzione: esportate ${righe.length} righe ma il server ne dichiarava ${totale}. Ne mancano ${totale - righe.length}.`, 8000);
    } else {
      messaggio("success", `${incluse.length} transazioni esportate${escluse ? ` (${escluse} da portafogli esclusi)` : ""}`);
    }
  } catch (e) {
    messaggio("error", erroreLeggibile(e), 5000);
  } finally {
    inCorso.value = false;
  }
}
</script>

<template>
  <div class="flex max-w-lg flex-col gap-3 px-4 pt-6">
    <div class="mb-3">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-testo2">Dati</p>
      <h1 class="text-3xl font-bold text-testo">Esporta</h1>
      <p class="mt-2 text-sm text-testo2">
        Un file CSV con una riga per transazione: data, importo, descrizione, categoria, budget e portafoglio.
        Comprende tutti i portafogli.
      </p>
    </div>

    <button
      v-for="a in ambiti"
      :key="a.id"
      type="button"
      role="radio"
      :aria-checked="ambito === a.id"
      class="flex items-center gap-3.5 rounded-2xl border p-3.5 text-left"
      :class="ambito === a.id ? 'border-accent bg-accent/10' : 'border-bordo bg-card'"
      :disabled="inCorso"
      @click="ambito = a.id"
    >
      <i :class="['pi', a.icona, ambito === a.id ? 'text-accent' : 'text-testo2']" />
      <span class="flex-1">
        <span class="block font-semibold" :class="ambito === a.id ? 'text-accent' : 'text-testo'">{{ a.titolo }}</span>
        <span class="block text-xs text-testo2">{{ a.sotto }}</span>
      </span>
      <i :class="['pi', ambito === a.id ? 'pi-check-circle text-accent' : 'pi-circle text-testo2']" />
    </button>

    <div v-if="ambito !== 'tutto'" class="flex items-center gap-3 rounded-xl border border-bordo bg-card p-4">
      <label for="periodo" class="flex-1 text-sm text-testo2">
        {{ ambito === "anno" ? "Anno da esportare" : "Mese da esportare" }}
      </label>
      <DatePicker
        v-model="periodo"
        inputId="periodo"
        :view="ambito === 'anno' ? 'year' : 'month'"
        :dateFormat="ambito === 'anno' ? 'yy' : 'mm/yy'"
        :disabled="inCorso"
        class="w-36"
      />
    </div>

    <p v-if="esclusi.length" class="text-xs text-testo2">
      Esclusi dall'export: {{ esclusi.map((w) => w.Nome).join(", ") }}. Puoi cambiarlo in Impostazioni.
    </p>

    <Button
      :label="inCorso ? 'Preparo il file…' : 'Esporta CSV'"
      icon="pi pi-download"
      :loading="inCorso"
      class="mt-3"
      @click="esporta"
    />
  </div>
</template>

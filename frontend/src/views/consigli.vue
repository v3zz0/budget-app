<script setup>
import { onMounted } from "vue";
import { useToast } from "primevue/usetoast";
import { useConsigliStore } from "@/stores/consigli.js";
import { useDashboardStore } from "@/stores/dashboard.js";
import { erroreLeggibile } from "@/services/api.js";
import { euro } from "@/utils/budget.js";

const toast = useToast();
const consigli = useConsigliStore();
const dashboard = useDashboardStore();

// I consigli nuovi di questa visita restano evidenziati anche dopo averli
// segnati come letti (aprire la lista spegne il pallino sulla campanella).
let nuovi = new Set();
onMounted(async () => {
  await consigli.carica();
  nuovi = new Set(consigli.lista.filter((c) => c.stato === "nuovo").map((c) => c.documentId));
  consigli.segnaTuttiLetti();
});

const errore = (e) => toast.add({ severity: "error", summary: "Errore", detail: erroreLeggibile(e), life: 4000 });

async function applica(c) {
  try {
    await consigli.applica(c);
    toast.add({
      severity: "success",
      summary: `Budget di ${c.categorie?.Nome} aggiornato a ${euro(c.budgetProposto)}`,
      life: 3000,
    });
    // La dashboard mostra i budget: va ricaricata o resterebbe col valore vecchio.
    dashboard.carica();
  } catch (e) {
    errore(e);
  }
}

async function ignora(c) {
  try {
    await consigli.ignora(c);
  } catch (e) {
    errore(e);
  }
}

// Barrette dei mesi analizzati: i numeri su cui si basa il consiglio, così si
// controlla in due secondi invece di doversi fidare.
const massimo = (c) => Math.max(c.budgetAttuale, ...(c.mesiAnalizzati || []).map((m) => m.speso));
const altezza = (c, m) => (massimo(c) > 0 ? Math.min(Math.max((m.speso / massimo(c)) * 40, 2), 40) : 2);
</script>

<template>
  <div class="flex flex-col gap-4 px-4 pt-6">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-testo2">Budget</p>
      <h1 class="text-3xl font-bold text-testo">Consigli</h1>
    </div>

    <template v-if="consigli.loading && !consigli.lista.length">
      <Skeleton v-for="i in 2" :key="i" height="11rem" borderRadius="16px" />
    </template>

    <div v-else-if="!consigli.lista.length" class="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <i class="pi pi-check-circle text-4xl text-testo2" />
      <p class="text-lg font-semibold text-testo">Nessun consiglio</p>
      <p class="text-sm text-testo2">
        I budget rispecchiano le tue spese. I consigli vengono ricalcolati a fine mese, e servono almeno tre mesi di
        storico per categoria.
      </p>
    </div>

    <article
      v-for="c in consigli.lista"
      :key="c.documentId"
      class="rounded-2xl border bg-card p-4"
      :class="nuovi.has(c.documentId) ? (c.tipo === 'alza' ? 'border-errore/50' : 'border-positivo/50') : 'border-bordo'"
    >
      <div class="flex items-center gap-2">
        <i :class="['pi', c.tipo === 'alza' ? 'pi-arrow-up-right text-errore-testo' : 'pi-arrow-down-right text-positivo']" />
        <span v-if="c.categorie?.icona">{{ c.categorie.icona }}</span>
        <h2 class="flex-1 font-semibold text-testo">{{ c.categorie?.Nome }}</h2>
        <span class="font-bold" :class="c.tipo === 'alza' ? 'text-errore-testo' : 'text-positivo'">
          {{ euro(c.budgetAttuale) }} → {{ euro(c.budgetProposto) }}
        </span>
      </div>
      <p class="mt-2 text-sm text-testo2">{{ c.testo }}</p>

      <div v-if="c.mesiAnalizzati?.length" class="mt-3 flex items-end gap-1">
        <div v-for="m in c.mesiAnalizzati" :key="m.mese" class="flex flex-1 flex-col items-center gap-0.5">
          <span class="text-[10px]" :class="m.speso > c.budgetAttuale ? 'text-errore-testo' : 'text-testo2'">
            {{ Math.round(m.speso) }}
          </span>
          <div
            class="w-full rounded-sm"
            :class="m.speso > c.budgetAttuale ? 'bg-errore' : 'bg-positivo'"
            :style="{ height: altezza(c, m) + 'px' }"
          />
          <!-- "2026-07" -> "07" -->
          <span class="text-[9px] text-testo2">{{ m.mese.slice(5) }}</span>
        </div>
      </div>

      <div class="mt-4 flex items-center gap-2">
        <Button label="Applica" class="flex-1" @click="applica(c)" />
        <Button label="Ignora" severity="secondary" text @click="ignora(c)" />
      </div>
    </article>
  </div>
</template>

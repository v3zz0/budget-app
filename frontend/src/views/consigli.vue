<script setup>
import { onMounted } from "vue";
import { useToast } from "primevue/usetoast";
import { useConsigliStore } from "@/stores/consigli.js";
import { useDashboardStore } from "@/stores/dashboard.js";
import { erroreLeggibile } from "@/services/api.js";
import { eur } from "@/utils/formato.js";
import { nomeMese } from "@/utils/budget.js";
const euro = (v) => eur(v, { corto: true });

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
  <div>
    <div class="mb-8 sm:mb-10">
      <router-link to="/" class="eyebrow inline-flex items-center gap-1.5 hover:text-testo"><i class="ph-bold ph-arrow-left" />Home</router-link>
      <h1 class="display">Consigli</h1>
    </div>

    <template v-if="consigli.loading && !consigli.lista.length">
      <Skeleton v-for="i in 2" :key="i" height="13rem" borderRadius="28px" class="mb-3" />
    </template>

    <div v-else-if="!consigli.lista.length" class="panel flex flex-col items-center gap-2 py-16 text-center">
      <i class="ph-bold ph-check-circle text-4xl text-fg-accento" />
      <p class="text-lg font-semibold">Nessun consiglio</p>
      <p class="max-w-[52ch] text-sm text-testo2">
        I budget rispecchiano le tue spese. I consigli guardano solo le uscite, vengono ricalcolati a fine mese e servono almeno tre
        mesi di storico per categoria.
      </p>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <article
        v-for="c in consigli.lista"
        :key="c.documentId"
        class="panel reveal flex flex-col gap-4"
        :class="{ 'shadow-[inset_0_0_0_2px_var(--color-anello)]': nuovi.has(c.documentId) }"
      >
        <div class="flex items-center gap-3">
          <span class="grid h-11 w-11 flex-none place-items-center rounded-full bg-campo text-[22px]"><Emoji :e="c.categorie?.icona || '🏷️'" /></span>
          <h2 class="min-w-0 flex-1 truncate text-[17px] font-semibold">{{ c.categorie?.Nome }}</h2>
          <span class="chip text-inchiostro" :class="c.tipo === 'alza' ? 'bg-arancio!' : 'bg-salvia!'">
            <i class="ph-bold" :class="c.tipo === 'alza' ? 'ph-arrow-up-right' : 'ph-arrow-down-right'" />{{ c.tipo === "alza" ? "alza" : "abbassa" }}
          </span>
        </div>
        <p class="num text-[34px] leading-none tracking-[-0.04em]">
          <span class="text-testo3">{{ euro(c.budgetAttuale) }}</span> → {{ euro(c.budgetProposto) }}
        </p>
        <p class="text-[14.5px] text-testo2">{{ c.testo }}</p>

        <div v-if="c.mesiAnalizzati?.length" class="flex h-[88px] items-end gap-1.5" aria-label="Spesa dei mesi analizzati">
          <div v-for="m in c.mesiAnalizzati" :key="m.mese" class="flex flex-1 flex-col items-center gap-1">
            <span class="num text-[11px]" :class="m.speso > c.budgetAttuale ? 'text-fg-avviso' : 'text-testo2'">{{ Math.round(m.speso) }}</span>
            <div class="w-full max-w-9 rounded-md" :class="m.speso > c.budgetAttuale ? 'bg-arancio' : 'bg-salvia'" :style="{ height: altezza(c, m) + 'px' }" />
            <span class="text-[11px] font-medium text-testo2">{{ nomeMese(Number(m.mese.slice(5, 7))).slice(0, 3) }}</span>
          </div>
        </div>

        <div class="mt-auto flex gap-2">
          <button class="pill-btn pill-btn--cream h-12! flex-1" @click="applica(c)">Applica</button>
          <button class="pill-btn pill-btn--ghost h-12!" @click="ignora(c)">Ignora</button>
        </div>
      </article>
    </div>
  </div>
</template>

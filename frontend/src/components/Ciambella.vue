<script setup>
import { computed, ref } from "vue";
import { arco } from "@/utils/home.js";
import { eur } from "@/utils/formato.js";

// Grafico a ciambella del mockup. fette = [{ id, nome, valore, colore }],
// centro = { etichetta, valore, sotto }. Al passaggio su una fetta (o sulla
// sua riga di legenda) il centro mostra quella fetta.
const props = defineProps({ fette: { type: Array, default: () => [] }, centro: { type: Object, required: true } });
const accesa = ref(null);
const totale = computed(() => props.fette.reduce((s, f) => s + f.valore, 0));
const archi = computed(() => {
  let a = -Math.PI / 2;
  return props.fette.map((f) => {
    const a1 = a + (f.valore / totale.value) * Math.PI * 2;
    const d = arco(130, 130, 129, 89, a, a1);
    a = a1;
    return { ...f, d, pct: Math.round((f.valore / totale.value) * 100) };
  });
});
const mostra = computed(() => {
  const f = archi.value.find((x) => x.id === accesa.value);
  return f ? { etichetta: f.nome, valore: f.valore, sotto: `${f.pct}% del totale` } : props.centro;
});
const parti = (v) => {
  const t = eur(v);
  const i = t.lastIndexOf(",");
  return [t.slice(0, i), t.slice(i)];
};
</script>

<template>
  <div class="grid grid-cols-1 items-center justify-items-center gap-6 sm:grid-cols-[auto_1fr] sm:justify-items-stretch sm:gap-10">
    <div class="relative h-[230px] w-[230px] sm:h-[260px] sm:w-[260px]">
      <svg viewBox="0 0 260 260" class="h-full w-full overflow-visible" role="img" :aria-label="archi.map((f) => `${f.nome} ${eur(f.valore)}`).join(', ') || 'Nessun dato'">
        <circle v-if="!totale" cx="130" cy="130" r="109" fill="none" stroke="var(--color-bordo)" stroke-width="40" />
        <path
          v-for="f in archi"
          :key="f.id"
          :d="f.d"
          :fill="f.colore"
          stroke="var(--color-card)"
          stroke-width="3"
          class="cursor-pointer transition-opacity"
          :class="{ 'opacity-30': accesa && accesa !== f.id }"
          @mouseenter="accesa = f.id"
          @mouseleave="accesa = null"
        />
      </svg>
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
        <small class="text-[13px] text-testo2">{{ totale ? mostra.etichetta : "Nessun dato" }}</small>
        <b class="num mt-0.5 text-[30px] font-normal">{{ parti(totale ? mostra.valore : 0)[0] }}<span class="dec">{{ parti(totale ? mostra.valore : 0)[1] }}</span></b>
        <span v-if="totale" class="mt-0.5 text-[12.5px] text-testo3">{{ mostra.sotto }}</span>
      </div>
    </div>
    <div class="flex w-full min-w-0 flex-col">
      <p v-if="!totale" class="vuoto">Nessun movimento in questo mese</p>
      <div
        v-for="(f, i) in archi"
        :key="f.id"
        class="grid grid-cols-[10px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl px-2 py-[11px]"
        :class="[accesa === f.id ? 'bg-campo' : i && accesa !== archi[i - 1].id ? 'border-t border-bordo' : '']"
        @mouseenter="accesa = f.id"
        @mouseleave="accesa = null"
      >
        <span class="h-2.5 w-2.5 rounded-[3px]" :style="{ background: f.colore }" />
        <span class="truncate text-[14.5px]">{{ f.nome }}</span>
        <span class="font-mono text-[12.5px] text-testo2">{{ f.pct }}%</span>
        <span class="min-w-[92px] text-right text-[14.5px] font-medium"><Euro :v="f.valore" /></span>
      </div>
    </div>
  </div>
</template>

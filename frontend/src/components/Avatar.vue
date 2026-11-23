<script setup>
import { computed } from "vue";

// Avatar di una persona: foto, oppure l'iniziale sul suo colore.
// p = { nome, foto, colore } (vedi utils/persone.js) oppure "cassa".
const props = defineProps({
  p: { type: [Object, String], default: null },
  size: { type: Number, default: 28 },
});
const cassa = computed(() => props.p === "cassa");
const ini = computed(() => (props.p?.nome || "?").trim().charAt(0).toUpperCase() || "?");
const stile = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.round(props.size * 0.42)}px`,
  background: cassa.value ? "var(--color-persona-cassa)" : `var(--color-av-${props.p?.colore || "nebbia"})`,
}));
</script>

<template>
  <span
    class="inline-grid flex-none place-items-center overflow-hidden rounded-full leading-none font-semibold text-inchiostro"
    :style="stile"
    :title="cassa ? 'Cassa comune' : p?.nome"
  >
    <i v-if="cassa" class="ph-bold ph-vault" />
    <img v-else-if="p?.foto" :src="p.foto" :alt="p.nome" class="h-full w-full object-cover" />
    <template v-else>{{ ini }}</template>
  </span>
</template>

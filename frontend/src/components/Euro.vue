<script setup>
import { computed } from "vue";
import { eur } from "@/utils/formato.js";

// Importo "€1.388,00" con i decimali attenuati. segno: "+" davanti ai positivi.
const props = defineProps({ v: { type: Number, default: 0 }, segno: Boolean, corto: Boolean });
const parti = computed(() => {
  const t = eur(props.v, { segno: props.segno, corto: props.corto });
  const i = t.lastIndexOf(",");
  return i < 0 ? [t, ""] : [t.slice(0, i), t.slice(i)];
});
</script>

<template>
  <span class="num">{{ parti[0] }}<span v-if="parti[1]" class="dec">{{ parti[1] }}</span></span>
</template>

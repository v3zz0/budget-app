<script setup>
import { nomeMese } from "@/utils/budget.js";

// ‹ Novembre 2026 ›  — v-model = { anno, mese }
defineProps({ compatto: Boolean });
const emit = defineEmits(["sposta"]);
const m = defineModel({ type: Object, required: true });
</script>

<template>
  <div class="flex items-center gap-2">
    <button type="button" class="circle-btn h-10! w-10! bg-campo! text-base!" aria-label="Mese precedente" @click="emit('sposta', -1)">
      <i class="ph-bold ph-caret-left" />
    </button>
    <b class="text-center font-medium tracking-[-0.03em]" :class="compatto ? 'min-w-[130px] text-lg' : 'min-w-[130px] text-lg sm:min-w-[170px] sm:text-[22px]'" aria-live="polite">
      {{ nomeMese(m.mese) }} {{ m.anno }}
    </b>
    <button type="button" class="circle-btn h-10! w-10! bg-campo! text-base!" aria-label="Mese successivo" @click="emit('sposta', 1)">
      <i class="ph-bold ph-caret-right" />
    </button>
  </div>
</template>

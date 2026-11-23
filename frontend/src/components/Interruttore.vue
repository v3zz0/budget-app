<script setup>
// Interruttore del mockup (pista crema quando acceso). v-model booleano.
defineProps({ disabled: Boolean, etichetta: { type: String, default: "" } });
const acceso = defineModel({ type: Boolean, default: false });
</script>

<template>
  <span class="relative inline-block h-6 w-10 flex-none">
    <input
      v-model="acceso"
      type="checkbox"
      role="switch"
      class="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      :disabled="disabled"
      :aria-label="etichetta || undefined"
    />
    <span
      class="absolute inset-0 rounded-full bg-bordo-forte transition-colors peer-checked:bg-crema peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-anello peer-disabled:opacity-45 after:absolute after:top-[3px] after:left-[3px] after:h-[18px] after:w-[18px] after:rounded-full after:bg-pomello after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-inchiostro"
    />
  </span>
</template>

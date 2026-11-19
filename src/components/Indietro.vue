<script setup>
defineProps({
  to: { type: String, default: "/impostazioni" },
  label: { type: String, default: "Impostazioni" },
});
</script>

<template>
  <router-link :to="to" class="mb-3 inline-flex items-center gap-2 text-sm text-testo2 hover:text-testo">
    <i class="pi pi-arrow-left text-xs" />{{ label }}
  </router-link>
</template>

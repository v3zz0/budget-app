<script setup>
import { computed, ref, watch } from "vue";

// Emoji in stile Apple come immagine (uguale su ogni dispositivo), servite in
// locale da /emoji (vedi vite.config.js). Se il file non c'è si riprova senza
// il selettore FE0F, poi si ripiega sul carattere di sistema.
const props = defineProps({ e: { type: String, default: "" } });
const codice = computed(() => [...(props.e || "")].map((c) => c.codePointAt(0).toString(16)).join("-"));
const tentativo = ref(0);
watch(codice, () => (tentativo.value = 0));
const src = computed(() =>
  tentativo.value === 0 ? `/emoji/${codice.value}.png` : `/emoji/${codice.value.replace(/-fe0f/g, "")}.png`,
);
</script>

<template>
  <img
    v-if="e && tentativo < 2"
    class="emo"
    :src="src"
    :alt="e"
    draggable="false"
    @error="tentativo++"
  />
  <span v-else-if="e">{{ e }}</span>
</template>

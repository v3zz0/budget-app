<script setup>
import { nextTick, ref, watch } from "vue";
import { useMovimentoStore } from "@/stores/movimento.js";
import Transazioni from "@/views/transazioni.vue";

// Il form di Transazioni dentro un <dialog>: sale dal basso su telefono,
// pannello a destra da 500px al computer (progetto.md §23). Esc lo chiude il browser.
const mov = useMovimentoStore();
const dlg = ref(null);
watch(
  () => mov.aperto,
  async (a) => {
    if (!a) return dlg.value?.open && dlg.value.close();
    await nextTick();
    if (!dlg.value.open) dlg.value.showModal();
    await nextTick();
    dlg.value.querySelector("#imp")?.focus();
  },
);
const fuori = (e) => e.target === dlg.value && mov.chiudi();
</script>

<template>
  <dialog ref="dlg" class="foglio-mov" aria-label="Movimento" @close="mov.chiudi()" @click="fuori">
    <div class="corpo">
      <span class="maniglia" aria-hidden="true" />
      <Transazioni v-if="mov.aperto" :key="mov.n" foglio :id="mov.opz.id || null" :opz="mov.opz" @chiudi="mov.chiudi()" @salvato="(d) => (mov.salvato(d), mov.chiudi())" />
    </div>
  </dialog>
</template>

<style scoped>
.foglio-mov {
  margin: 0; padding: 0; border: 0; background: transparent; color: inherit;
  max-width: none; max-height: none;
  position: fixed; inset: auto 0 0 0; width: 100%;
}
.foglio-mov::backdrop { background: rgba(0, 0, 0, 0.5); }
.corpo { max-height: calc(100dvh - 40px); overflow-y: auto; overscroll-behavior: contain; position: relative; }
.corpo :deep(section) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.maniglia { position: absolute; top: 8px; left: 50%; translate: -50% 0; width: 40px; height: 4px; border-radius: 2px; background: var(--color-inchiostro-linea); z-index: 1; }
.foglio-mov[open] .corpo { animation: sali 0.32s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes sali { from { transform: translateY(40px); opacity: 0; } }
@media (min-width: 641px) {
  .foglio-mov { inset: 0 0 0 auto; width: 500px; height: 100dvh; }
  .corpo { max-height: 100dvh; height: 100%; }
  .corpo :deep(section) { border-radius: 0; min-height: 100dvh; }
  .maniglia { display: none; }
  @keyframes sali { from { transform: translateX(40px); opacity: 0; } }
}
</style>

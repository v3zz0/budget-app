<script setup>
import { computed, nextTick, ref } from "vue";
import { EMOJI_CATEGORIE, aggiungiRecente, griglia, primaEmoji } from "@/utils/emoji.js";

// Scelta dell'emoji di una categoria (progetto.md §18): la lista condivisa e,
// in fondo, "+" per scriverne una qualsiasi dalla tastiera. Le scritte a mano
// restano in testa (le ultime 8, su questo dispositivo).
// suBlocco: dentro il foglio colorato di Transazioni (inchiostro al posto dei grigi).
const props = defineProps({ suBlocco: Boolean, lista: { type: Array, default: () => EMOJI_CATEGORIE } });
const scelta = defineModel({ type: String, default: "" });

const CHIAVE = "budget.emoji.recenti";
const leggi = () => {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE)) || [];
  } catch {
    return [];
  }
};
const recenti = ref(leggi());
const voci = computed(() => griglia(scelta.value, recenti.value, props.lista));
const propria = ref(false);
const testo = ref("");
const errore = ref(false);
const campo = ref(null);

async function apriPropria() {
  propria.value = !propria.value;
  testo.value = "";
  errore.value = false;
  if (propria.value) {
    await nextTick();
    campo.value?.focus();
  }
}
function scritta() {
  const v = testo.value.trim();
  if (!v) return (errore.value = false);
  const e = primaEmoji(v);
  if (!e) return (errore.value = true);
  recenti.value = aggiungiRecente(recenti.value, e);
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(recenti.value));
  } catch {
    /* modalità privata: restano per questa pagina */
  }
  scelta.value = e;
  propria.value = false;
}
</script>

<template>
  <div>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(42px,1fr))] gap-1.5" role="radiogroup" aria-label="Emoji">
      <button
        v-for="e in voci"
        :key="e"
        type="button"
        role="radio"
        :aria-checked="scelta === e"
        class="grid aspect-square place-items-center rounded-xl text-[22px]"
        :class="[
          suBlocco ? 'hover:bg-inchiostro-velo' : 'bg-card',
          scelta === e ? (suBlocco ? 'shadow-[inset_0_0_0_2px_var(--color-inchiostro)]' : 'shadow-[inset_0_0_0_2px_var(--color-testo)]') : '',
        ]"
        @click="scelta = e"
      >
        <Emoji :e="e" />
      </button>
      <button
        type="button"
        class="grid aspect-square place-items-center rounded-xl text-lg"
        :class="suBlocco ? 'border-[1.5px] border-dashed border-inchiostro-linea' : 'border-[1.5px] border-dashed border-bordo-forte text-testo2'"
        :aria-expanded="propria"
        aria-label="Scegli un'altra emoji dalla tastiera"
        title="Un'altra emoji"
        @click="apriPropria"
      >
        <i class="ph-bold ph-plus" />
      </button>
    </div>
    <div v-if="propria" class="mt-3">
      <label class="mb-2 block text-sm font-semibold" :class="{ 'etichetta font-medium!': !suBlocco }" for="emo-propria">La tua emoji</label>
      <input
        id="emo-propria"
        ref="campo"
        v-model="testo"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="Scegline una dalla tastiera"
        class="h-[52px] w-full rounded-full px-5 outline-none"
        :class="suBlocco ? 'bg-inchiostro-velo text-inchiostro placeholder:text-inchiostro/55 focus:shadow-[inset_0_0_0_2px_var(--color-inchiostro)]' : 'campo'"
        @input="scritta"
      />
      <p v-if="errore" class="mt-2 flex items-center gap-1.5 text-[13px] font-semibold" :class="{ 'text-fg-avviso': !suBlocco }">
        <i class="ph-bold ph-warning-circle" />Scrivi un'emoji, non lettere o numeri
      </p>
    </div>
  </div>
</template>

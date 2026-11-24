<script setup>
import { computed } from "vue";
import { useAuthStore } from "@/stores/auth.js";
import { preferenzaTema, temaChiaro } from "@/tema.js";

const auth = useAuthStore();
const scelte = computed(() => [
  { id: "sistema", icona: "ph-circle-half", titolo: "Sistema", sotto: `Ora è ${temaChiaro.value ? "giorno" : "notte"} sul tuo dispositivo`, anteprime: ["notte", "giorno"] },
  { id: "giorno", icona: "ph-sun", titolo: "Giorno", sotto: "Fondo chiaro, carta calda", anteprime: ["giorno"] },
  { id: "notte", icona: "ph-moon", titolo: "Notte", sotto: "Fondo antracite, riposa gli occhi", anteprime: ["notte"] },
]);
</script>

<template>
  <section class="panel reveal">
    <h2 class="text-[28px] leading-[1.05] font-medium tracking-[-0.04em] sm:text-[34px]">Aspetto</h2>
    <p class="mt-3 max-w-[60ch] text-testo2">
      Scegli se usare l'app con i colori di giorno o di notte. Con “Sistema” cambia da sola insieme al telefono o al computer.
    </p>
  </section>
  <section class="panel">
    <h3 id="t-tema" class="mb-5 text-[17px] font-semibold tracking-[-0.015em]">Modalità</h3>
    <div class="grid gap-2.5 md:grid-cols-3" role="radiogroup" aria-labelledby="t-tema">
      <button
        v-for="s in scelte"
        :key="s.id"
        type="button"
        role="radio"
        :aria-checked="preferenzaTema === s.id"
        class="flex items-center gap-4 rounded-[20px] bg-campo p-2.5 text-left transition-shadow hover:shadow-[inset_0_0_0_1.5px_var(--color-bordo-forte)] md:flex-col md:items-stretch md:pb-5"
        :class="{ 'shadow-[inset_0_0_0_2px_var(--color-anello)]!': preferenzaTema === s.id }"
        @click="auth.salvaTema(s.id)"
      >
        <span class="flex h-20 w-[120px] flex-none overflow-hidden rounded-[14px] md:h-[120px] md:w-auto" aria-hidden="true">
          <span v-for="a in s.anteprime" :key="a" class="relative flex-1 p-3" :class="a === 'notte' ? 'bg-mini-notte' : 'bg-mini-giorno'">
            <i class="block h-[46px] rounded-[9px]" :class="a === 'notte' ? 'bg-mini-notte-blocco' : 'bg-mini-giorno-blocco'" />
            <b class="mt-2 block h-2 w-[70%] rounded" :class="a === 'notte' ? 'bg-mini-notte-riga' : 'bg-mini-giorno-riga'" />
            <b class="mt-2 block h-2 w-[45%] rounded" :class="a === 'notte' ? 'bg-mini-notte-riga' : 'bg-mini-giorno-riga'" />
            <span class="absolute top-3 right-3 h-[22px] w-[22px] rounded-full" :class="a === 'notte' ? 'bg-arancio' : 'bg-salvia'" />
          </span>
        </span>
        <span class="md:px-2">
          <b class="flex items-center gap-2 text-[15.5px] font-semibold"><i class="ph-bold" :class="s.icona" />{{ s.titolo }}</b>
          <small class="mt-1 block text-[13px] text-testo2">{{ s.sotto }}</small>
        </span>
      </button>
    </div>
    <p class="mt-5 text-[12.5px] text-testo2">
      Da computer lo cambi anche al volo dal cerchio <i class="ph-bold ph-sun" /> / <i class="ph-bold ph-moon" /> in basso a
      destra, presente su ogni pagina. Da telefono si cambia solo da qui. La scelta vale su questo dispositivo e sul tuo account.
    </p>
  </section>
</template>

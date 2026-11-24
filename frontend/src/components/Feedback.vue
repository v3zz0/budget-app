<script setup>
import { computed, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth.js";
import { inviaFeedback } from "@/services/feedback.js";
import { erroreLeggibile } from "@/services/api.js";
import { TIPI_FEEDBACK, contestoPagina } from "@/utils/feedback.js";
import { temaChiaro } from "@/tema.js";
import { riduciFoto } from "@/utils/immagine.js";

// Pannello "Invia feedback" (progetto.md §20), aperto dal menu dell'account.
const aperto = defineModel({ type: Boolean, default: false });
const route = useRoute();
const auth = useAuthStore();
const MAX = 1000;

const f = reactive({ tipo: "problema", messaggio: "", foto: null, allega: true, rispondi: true });
const errore = ref("");
const invio = ref(false);
const fatto = ref(false);
const testo = ref(null);

const contesto = computed(() =>
  contestoPagina({ pagina: route.name, ua: navigator.userAgent, larghezza: innerWidth, altezza: innerHeight, chiaro: temaChiaro.value }),
);

watch(aperto, (v) => {
  if (v) Object.assign(f, { tipo: "problema", messaggio: "", foto: null, allega: true, rispondi: true }), (errore.value = ""), (fatto.value = false);
});

async function invia() {
  if (f.messaggio.trim().length < 10) {
    errore.value = "Scrivi almeno 10 caratteri";
    testo.value?.focus();
    return;
  }
  invio.value = true;
  errore.value = "";
  try {
    await inviaFeedback({
      tipo: f.tipo,
      messaggio: f.messaggio.trim(),
      contesto: f.allega ? contesto.value : "",
      rispondi: f.rispondi,
      // ridotta nel browser: uno screenshot di un telefono può pesare parecchi MB
      screenshot: f.foto ? await riduciFoto(f.foto, 1600) : null,
    });
    fatto.value = true;
  } catch (e) {
    errore.value = erroreLeggibile(e);
  } finally {
    invio.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="aperto"
    modal
    :showHeader="false"
    :pt="{ root: { class: 'w-[min(520px,calc(100%-32px))] max-h-[calc(100dvh-32px)] rounded-[20px]! sm:rounded-[28px]! border-0! bg-card!' }, content: { class: 'p-5! sm:p-8!' } }"
  >
    <div v-if="fatto" class="flex flex-col items-center gap-3 pt-6 pb-2 text-center" role="status">
      <span class="mb-2 grid h-16 w-16 place-items-center rounded-full bg-salvia text-[28px] text-inchiostro"><i class="ph-bold ph-check" /></span>
      <h2 class="text-[26px] leading-tight font-medium tracking-[-0.035em]">Grazie, l'abbiamo ricevuto</h2>
      <p class="max-w-[38ch] leading-relaxed text-testo2">
        {{ f.tipo === "problema" ? "Lo guardiamo il prima possibile." : "Ogni idea viene letta." }}
        <template v-if="f.rispondi">Se serve ti scriviamo a {{ auth.userInfo.email }}.</template>
      </p>
      <button class="pill-btn pill-btn--cream mt-4 h-12! min-w-40" @click="aperto = false">Chiudi</button>
    </div>

    <form v-else class="flex flex-col gap-5" novalidate @submit.prevent="invia">
      <div class="flex items-center justify-between gap-4">
        <h2 class="text-[22px] leading-tight font-medium tracking-[-0.035em] sm:text-[26px]">Invia un feedback</h2>
        <button type="button" class="grid h-10 w-10 flex-none place-items-center rounded-full bg-campo text-[17px] hover:bg-bordo" aria-label="Chiudi" @click="aperto = false">
          <i class="ph-bold ph-x" />
        </button>
      </div>
      <p class="-mt-4 text-[14.5px] text-testo2">Arriva direttamente a chi sviluppa l'app.</p>

      <div>
        <span id="fb-tipo-l" class="etichetta">Di cosa si tratta?</span>
        <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="fb-tipo-l">
          <button
            v-for="(t, k) in TIPI_FEEDBACK"
            :key="k"
            type="button"
            role="radio"
            :aria-checked="f.tipo === k"
            class="inline-flex h-[42px] items-center gap-2 rounded-full pr-4 pl-3.5 text-sm font-medium shadow-[inset_0_0_0_1.5px_var(--color-bordo-forte)]"
            :class="{ 'bg-crema text-inchiostro shadow-none!': f.tipo === k }"
            @click="f.tipo = k"
          >
            <i class="ph-bold" :class="t.icona" />{{ t.label }}
          </button>
        </div>
      </div>

      <div>
        <label class="etichetta" for="fb-text">Messaggio</label>
        <textarea
          id="fb-text"
          ref="testo"
          v-model="f.messaggio"
          rows="5"
          :maxlength="MAX"
          :placeholder="TIPI_FEEDBACK[f.tipo].ph"
          class="min-h-[120px] w-full resize-y rounded-[20px] bg-campo px-5 py-3.5 text-[15px] leading-normal text-testo outline-none placeholder:text-testo3 focus:shadow-[inset_0_0_0_2px_var(--color-testo3)]"
          @input="errore = ''"
        />
        <div class="mt-1.5 flex justify-between gap-3 text-[12.5px]">
          <span v-if="errore" class="inline-flex items-center gap-1.5 font-medium text-fg-avviso"><i class="ph-bold ph-warning-circle" />{{ errore }}</span>
          <span class="num ml-auto text-testo3">{{ f.messaggio.length }}/{{ MAX }}</span>
        </div>
      </div>

      <div>
        <span class="etichetta">Screenshot <small class="font-normal text-testo3">facoltativo</small></span>
        <label
          class="relative flex h-12 cursor-pointer items-center gap-2.5 overflow-hidden rounded-full border-[1.5px] border-dashed border-bordo-forte px-5 text-sm text-testo2 hover:border-testo3 hover:text-testo"
          :class="{ 'border-solid text-testo': f.foto }"
        >
          <input type="file" accept="image/*" class="absolute inset-0 cursor-pointer opacity-0" @change="f.foto = $event.target.files[0] || null" />
          <i class="ph-bold ph-image" /><span class="truncate">{{ f.foto ? f.foto.name : "Aggiungi un'immagine" }}</span>
        </label>
      </div>

      <label class="flex cursor-pointer items-start gap-3">
        <input v-model="f.allega" type="checkbox" class="mt-0.5 h-5 w-5 flex-none accent-[var(--color-crema)]" />
        <span><b class="block text-[14.5px] font-medium">Allega pagina e dispositivo</b><small class="block text-[12.5px] [overflow-wrap:anywhere] text-testo2">{{ contesto }}</small></span>
      </label>
      <label class="flex cursor-pointer items-start gap-3">
        <input v-model="f.rispondi" type="checkbox" class="mt-0.5 h-5 w-5 flex-none accent-[var(--color-crema)]" />
        <span><b class="block text-[14.5px] font-medium">Potete rispondermi via email</b><small class="block text-[12.5px] [overflow-wrap:anywhere] text-testo2">{{ auth.userInfo.email }}</small></span>
      </label>

      <div class="mt-2 flex justify-end gap-2">
        <button type="button" class="pill-btn pill-btn--ghost h-12! flex-1 px-4! sm:flex-none" @click="aperto = false">Annulla</button>
        <button type="submit" class="pill-btn pill-btn--cream h-12! flex-1 px-4! whitespace-nowrap sm:flex-none" :disabled="invio">{{ invio ? "Invio…" : "Invia feedback" }}</button>
      </div>
    </form>
  </Dialog>
</template>

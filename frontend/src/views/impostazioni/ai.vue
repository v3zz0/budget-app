<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/stores/auth.js";
import { modelliOpenRouter, provaAi, salvaAi } from "@/services/impostazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { MOTORI, chiaveImpostata, urlPerMotore } from "@/utils/impostazioni.js";
import Interruttore from "@/components/Interruttore.vue";

const toast = useToast();
const auth = useAuthStore();

const form = reactive({ motore: "ollama", url: "", modello: "" });
const chiave = ref(""); // non torna mai dal server: vuota = lascia quella salvata
const mostraChiave = ref(false);
const caricando = ref(true);
const salvando = ref(false);
const esito = ref(null); // { stato: "attesa" | "ok" | "errore", testo }
const modelli = ref([]); // elenco OpenRouter
const soloGratuiti = ref(true);

const motore = computed(() => MOTORI.find((m) => m.id === form.motore));
const giaSalvata = computed(() => chiaveImpostata(auth.userInfo, form.motore));
const elenco = computed(() => {
  const l = soloGratuiti.value ? modelli.value.filter((m) => m.endsWith(":free")) : modelli.value;
  // il modello salvato resta scelto anche se non è (più) nell'elenco
  return form.modello && !l.includes(form.modello) ? [form.modello, ...l] : l;
});

onMounted(async () => {
  try {
    await auth.fetchUserInfo();
  } catch (e) {
    toast.add({ severity: "error", summary: "Errore", detail: erroreLeggibile(e), life: 4000 });
  }
  const u = auth.userInfo;
  Object.assign(form, { motore: u.aiMotore || "ollama", url: u.aiUrl ?? "", modello: u.aiModello ?? "" });
  caricando.value = false;
});

// L'elenco dei modelli OpenRouter si scarica solo quando serve.
watch(
  () => form.motore,
  async (m) => {
    if (m !== "openrouter" || modelli.value.length) return;
    try {
      modelli.value = await modelliOpenRouter();
    } catch {
      /* elenco irraggiungibile: resta il campo libero */
    }
  },
);

function scegliMotore(id) {
  form.motore = id;
  form.url = urlPerMotore(id, form.url); // preset comodo, mai sopra un indirizzo scritto a mano
  chiave.value = "";
  esito.value = null;
}
const daForm = () => ({ motore: form.motore, url: form.url.trim(), modello: form.modello.trim() });

async function prova() {
  // Errori ovvi detti subito, come li direbbe il server
  if (form.motore !== "ollama" && !form.url.trim()) return (esito.value = { stato: "errore", testo: "Manca l'indirizzo del server" });
  if (form.motore === "openrouter" && !chiave.value.trim() && !giaSalvata.value) {
    return (esito.value = { stato: "errore", testo: "Serve la chiave API di OpenRouter" });
  }
  esito.value = { stato: "attesa", testo: "Provo la connessione…" };
  const t0 = performance.now();
  try {
    const { ok, messaggio } = await provaAi(daForm(), chiave.value.trim());
    const secondi = ((performance.now() - t0) / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 });
    esito.value = ok
      ? { stato: "ok", testo: `Connesso a ${motore.value.titolo} · risponde in ${secondi} s` }
      : { stato: "errore", testo: messaggio || "Connessione non riuscita" };
  } catch (e) {
    esito.value = { stato: "errore", testo: erroreLeggibile(e) };
  }
}

async function salva() {
  salvando.value = true;
  try {
    await salvaAi(auth.userInfo.id, daForm(), chiave.value.trim());
    await auth.fetchUserInfo(); // aggiorna i flag "chiave già salvata"
    chiave.value = "";
    toast.add({ severity: "success", summary: "Impostazioni salvate", life: 3000 });
  } catch (e) {
    toast.add({ severity: "error", summary: "Impostazioni non salvate", detail: erroreLeggibile(e), life: 4500 });
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <section class="panel reveal">
    <h2 class="text-[28px] leading-[1.05] font-medium tracking-[-0.04em] sm:text-[34px]">Analisi AI</h2>
    <p class="mt-3 max-w-[60ch] text-testo2">
      Il modello lavora solo sull'analisi degli estratti conto. Scegli dove farlo girare: sul tuo computer o nel cloud.
    </p>
    <div class="mt-5 flex flex-wrap gap-2 text-[13px]">
      <span class="inline-flex h-[34px] items-center gap-2 rounded-full bg-campo pr-4 pl-3"><i class="ph-bold ph-check-circle text-base text-fg-accento" />Movimenti letti in modo esatto, senza AI</span>
      <span class="inline-flex h-[34px] items-center gap-2 rounded-full bg-campo pr-4 pl-3"><i class="ph-bold ph-sparkle text-base text-fg-accento" />L'AI suggerisce le categorie</span>
      <span class="inline-flex h-[34px] items-center gap-2 rounded-full bg-campo pr-4 pl-3"><i class="ph-bold ph-sparkle text-base text-fg-accento" />L'AI scrive il giudizio del mese</span>
    </div>
  </section>

  <Skeleton v-if="caricando" height="16rem" borderRadius="28px" />
  <template v-else>
    <section class="panel">
      <h3 id="t-eng" class="mb-5 flex items-center gap-3 text-[17px] font-semibold tracking-[-0.015em]">
        <span class="grid h-7 w-7 place-items-center rounded-full bg-campo font-mono text-[13px] font-medium">1</span>Motore
      </h3>
      <div class="grid gap-2.5 md:grid-cols-3" role="radiogroup" aria-labelledby="t-eng">
        <button
          v-for="m in MOTORI"
          :key="m.id"
          type="button"
          role="radio"
          :aria-checked="form.motore === m.id"
          class="flex items-center gap-4 rounded-[20px] p-5 text-left transition-colors md:min-h-[200px] md:flex-col md:items-stretch md:gap-3"
          :class="form.motore === m.id ? 'bg-crema text-inchiostro' : 'bg-campo hover:bg-bordo'"
          @click="scegliMotore(m.id)"
        >
          <span class="order-2 ml-auto flex items-center justify-between md:order-none md:ml-0">
            <span class="hidden h-12 w-12 place-items-center rounded-full text-[22px] md:grid" :class="form.motore === m.id ? 'bg-inchiostro-velo' : 'bg-card'">
              <i class="ph-bold" :class="m.icona" />
            </span>
            <span
              class="h-[22px] w-[22px] rounded-full"
              :class="form.motore === m.id ? 'shadow-[inset_0_0_0_7px_var(--color-inchiostro)]' : 'shadow-[inset_0_0_0_2px_var(--color-bordo-forte)]'"
            />
          </span>
          <span class="order-1 md:order-none md:mt-auto">
            <b class="block text-[17px] font-semibold tracking-[-0.015em]">{{ m.titolo }}</b>
            <small class="block text-[13px] leading-snug" :class="form.motore === m.id ? 'text-inchiostro' : 'text-testo2'">{{ m.sotto }}</small>
            <span class="mt-1 inline-flex items-center gap-1.5 text-xs font-medium"><i class="ph-bold" :class="m.locale ? 'ph-house' : 'ph-globe'" />{{ m.dove }}</span>
          </span>
        </button>
      </div>
      <div class="mt-4 flex items-start gap-3 rounded-[14px] bg-fondo px-5 py-4 text-[13.5px] leading-normal">
        <i class="ph-bold mt-px text-lg" :class="motore.locale ? 'ph-shield-check text-fg-positivo' : 'ph-cloud-arrow-up text-fg-accento'" />
        {{ motore.privacy }}
      </div>
    </section>

    <section class="panel">
      <h3 class="mb-5 flex items-center gap-3 text-[17px] font-semibold tracking-[-0.015em]">
        <span class="grid h-7 w-7 place-items-center rounded-full bg-campo font-mono text-[13px] font-medium">2</span>Connessione
      </h3>
      <div class="flex flex-col gap-5">
        <div>
          <label class="etichetta flex justify-between" for="ai-url">Indirizzo <small class="font-normal text-testo2">{{ motore.urlHint }}</small></label>
          <input id="ai-url" v-model="form.url" class="campo rounded-full! bg-fondo! font-mono text-[13.5px]" :placeholder="motore.esempio" autocomplete="off" spellcheck="false" />
        </div>
        <div v-if="form.motore !== 'ollama'">
          <label class="etichetta flex justify-between" for="ai-key">
            Chiave API
            <small class="font-normal text-testo2">{{ form.motore === "openrouter" ? "obbligatoria" : "facoltativa (--api-key)" }}</small>
          </label>
          <div class="relative">
            <input
              id="ai-key"
              v-model="chiave"
              class="campo rounded-full! bg-fondo! pr-14 font-mono text-[13.5px]"
              :type="mostraChiave ? 'text' : 'password'"
              autocomplete="off"
              spellcheck="false"
              :placeholder="giaSalvata ? '•••••••• già salvata' : form.motore === 'openrouter' ? 'sk-or-v1-…' : ''"
            />
            <button
              type="button"
              class="absolute top-1/2 right-2 grid h-[38px] w-[38px] -translate-y-1/2 place-items-center rounded-full text-testo2 hover:bg-campo hover:text-testo"
              :aria-label="mostraChiave ? 'Nascondi la chiave' : 'Mostra la chiave'"
              @click="mostraChiave = !mostraChiave"
            >
              <i class="ph-bold" :class="mostraChiave ? 'ph-eye-slash' : 'ph-eye'" />
            </button>
          </div>
          <p class="mt-2 text-[12.5px] text-testo2">
            Salvata sul server (cifrata), mai nel browser.{{ giaSalvata ? " Lascia vuoto per tenere quella salvata." : "" }}
          </p>
        </div>
        <div>
          <label class="etichetta flex justify-between" for="ai-mod">Modello <small class="font-normal text-testo2">{{ motore.modelloHint }}</small></label>
          <Select
            v-if="form.motore === 'openrouter' && modelli.length"
            v-model="form.modello"
            inputId="ai-mod"
            :options="elenco"
            filter
            placeholder="Scegli un modello"
            :virtualScrollerOptions="{ itemSize: 38 }"
            fluid
            class="font-mono text-[13.5px]"
          />
          <input v-else id="ai-mod" v-model="form.modello" class="campo rounded-full! bg-fondo! font-mono text-[13.5px]" autocomplete="off" spellcheck="false" />
          <label v-if="form.motore === 'openrouter' && modelli.length" class="mt-2.5 flex w-max cursor-pointer items-center gap-3 text-[13.5px]">
            <Interruttore v-model="soloGratuiti" />Mostra solo i modelli gratuiti
          </label>
        </div>
      </div>
    </section>

    <section class="panel">
      <h3 class="mb-5 flex items-center gap-3 text-[17px] font-semibold tracking-[-0.015em]">
        <span class="grid h-7 w-7 place-items-center rounded-full bg-campo font-mono text-[13px] font-medium">3</span>Prova e salva
      </h3>
      <div class="flex flex-wrap items-center gap-4">
        <button class="pill-btn pill-btn--ghost" :disabled="esito?.stato === 'attesa'" @click="prova">
          <i class="ph-bold ph-plugs-connected" />Prova connessione
        </button>
        <span v-if="esito" class="inline-flex items-center gap-2 text-sm" aria-live="polite">
          <i
            class="ph-bold"
            :class="{
              'ph-circle-notch animate-spin': esito.stato === 'attesa',
              'ph-check-circle text-fg-positivo': esito.stato === 'ok',
              'ph-warning-circle text-fg-avviso': esito.stato === 'errore',
            }"
          />{{ esito.testo }}
        </span>
      </div>
      <div class="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p class="text-[13.5px] text-testo2">Vale per tutte le analisi di questo account.</p>
        <button class="pill-btn pill-btn--cream h-14! px-8!" :disabled="salvando" @click="salva">Salva impostazioni</button>
      </div>
    </section>
  </template>
</template>

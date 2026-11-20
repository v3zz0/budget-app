<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/stores/auth.js";
import { modelliOpenRouter, provaAi, salvaAi } from "@/services/impostazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { MOTORI, chiaveImpostata, urlPerMotore } from "@/utils/impostazioni.js";

const toast = useToast();
const auth = useAuthStore();

const form = reactive({ motore: "ollama", url: "", modello: "" });
const chiave = ref(""); // non torna mai dal server: vuota = lascia quella salvata
const caricando = ref(true);
const salvando = ref(false);
const provando = ref(false);
const modelli = ref(null); // elenco OpenRouter, dopo "Scegli dall'elenco"
const caricandoModelli = ref(false);

const avviso = (severity, summary, detail) => toast.add({ severity, summary, detail, life: 4500 });

const motore = computed(() => MOTORI.find((m) => m.id === form.motore));
const usaChiave = computed(() => form.motore !== "ollama");
const giaSalvata = computed(() => chiaveImpostata(auth.userInfo, form.motore));

onMounted(async () => {
  try {
    await auth.fetchUserInfo();
  } catch (e) {
    avviso("error", "Errore", erroreLeggibile(e));
  }
  const u = auth.userInfo;
  Object.assign(form, { motore: u.aiMotore || "ollama", url: u.aiUrl ?? "", modello: u.aiModello ?? "" });
  caricando.value = false;
});

function scegliMotore(id) {
  form.motore = id;
  form.url = urlPerMotore(id, form.url); // preset comodo, mai sopra un indirizzo scritto a mano
  chiave.value = "";
  modelli.value = null;
}

// Valori del form puliti, anche non ancora salvati
const daForm = () => ({ motore: form.motore, url: form.url.trim(), modello: form.modello.trim() });

async function prova() {
  provando.value = true;
  try {
    const { ok, messaggio } = await provaAi(daForm(), chiave.value.trim());
    avviso(ok ? "success" : "error", ok ? "Connessione riuscita" : "Connessione non riuscita", messaggio);
  } catch (e) {
    avviso("error", "Prova non riuscita", erroreLeggibile(e));
  } finally {
    provando.value = false;
  }
}

async function salva() {
  salvando.value = true;
  try {
    await salvaAi(auth.userInfo.id, daForm(), chiave.value.trim());
    await auth.fetchUserInfo(); // aggiorna i flag "chiave già salvata"
    chiave.value = "";
    avviso("success", "Impostazioni salvate");
  } catch (e) {
    avviso("error", "Impostazioni non salvate", erroreLeggibile(e));
  } finally {
    salvando.value = false;
  }
}

async function caricaModelli() {
  caricandoModelli.value = true;
  try {
    modelli.value = await modelliOpenRouter();
  } catch {
    avviso("warn", "Elenco modelli non raggiungibile", "Scrivi il nome del modello a mano.");
  } finally {
    caricandoModelli.value = false;
  }
}
</script>

<template>
  <div class="flex max-w-lg flex-col gap-5 px-4 pt-6">
    <div>
      <Indietro />
      <h1 class="text-3xl font-bold text-testo">Analisi AI</h1>
      <p class="mt-2 text-sm text-testo2">
        I movimenti vengono letti dal server in modo esatto, senza AI. Il modello qui sotto serve solo a suggerire le
        categorie e a scrivere il giudizio del mese.
      </p>
    </div>

    <Skeleton v-if="caricando" height="16rem" borderRadius="16px" />

    <template v-else>
      <div class="flex flex-col gap-2.5" role="radiogroup" aria-label="Motore AI">
        <button
          v-for="m in MOTORI"
          :key="m.id"
          type="button"
          role="radio"
          :aria-checked="form.motore === m.id"
          class="flex items-center gap-3.5 rounded-2xl border p-3.5 text-left"
          :class="form.motore === m.id ? 'border-accent bg-accent/10' : 'border-bordo bg-card'"
          @click="scegliMotore(m.id)"
        >
          <i :class="['pi', m.icona, form.motore === m.id ? 'text-accent' : 'text-testo2']" />
          <span class="flex-1">
            <span class="block font-semibold" :class="form.motore === m.id ? 'text-accent' : 'text-testo'">{{ m.titolo }}</span>
            <span class="block text-xs text-testo2">{{ m.sotto }}</span>
          </span>
          <i :class="['pi', form.motore === m.id ? 'pi-check-circle text-accent' : 'pi-circle text-testo2']" />
        </button>
      </div>

      <form class="flex flex-col gap-4 rounded-2xl border border-bordo bg-card p-5" @submit.prevent="salva">
        <p class="text-[11px] font-semibold uppercase tracking-[0.15em] text-testo2">Connessione</p>

        <div class="flex flex-col gap-2">
          <label for="url" class="text-sm text-testo2">
            {{ form.motore === "openrouter" ? "Indirizzo API" : `Indirizzo (es. ${motore.esempio})` }}
          </label>
          <InputText id="url" v-model="form.url" type="url" fluid />
        </div>

        <div class="flex flex-col gap-2">
          <label for="modello" class="text-sm text-testo2">Modello</label>
          <div class="flex gap-2">
            <InputText id="modello" v-model="form.modello" class="flex-1" />
            <Button
              v-if="form.motore === 'openrouter'"
              type="button"
              icon="pi pi-search"
              severity="secondary"
              aria-label="Scegli dall'elenco"
              :loading="caricandoModelli"
              @click="caricaModelli"
            />
          </div>
          <!-- Elenco OpenRouter con ricerca: i gratuiti stanno in cima -->
          <Select
            v-if="modelli"
            :options="modelli"
            filter
            placeholder="Cerca fra i modelli…"
            :virtualScrollerOptions="{ itemSize: 38 }"
            fluid
            @update:modelValue="(v) => (form.modello = v)"
          />
        </div>

        <div v-if="usaChiave" class="flex flex-col gap-2">
          <label for="chiave" class="text-sm text-testo2">
            {{
              giaSalvata
                ? "Chiave API (già salvata, riscrivi per cambiarla)"
                : form.motore === "llamacpp"
                  ? "Chiave API (vuota se il server non la richiede)"
                  : "Chiave API"
            }}
          </label>
          <InputText id="chiave" v-model="chiave" type="password" autocomplete="off" fluid />
        </div>

        <Button type="button" label="Prova connessione" icon="pi pi-wifi" severity="secondary" outlined :loading="provando" @click="prova" />
        <Button type="submit" label="Salva impostazioni" :loading="salvando" />
      </form>
    </template>
  </div>
</template>

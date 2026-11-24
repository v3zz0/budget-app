<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useDashboardStore } from "@/stores/dashboard.js";
import { useToast } from "primevue/usetoast";
import Interruttore from "@/components/Interruttore.vue";
import { erroreLeggibile } from "@/services/api.js";
import {
  attivaNotifiche, disattivaNotifiche, provaNotifiche, salvaPreferenze,
  statoNotifiche, supportaNotifiche,
} from "@/services/notifiche.js";

const toast = useToast();
const dashboard = useDashboardStore();
// Anteprima "Come le vedrai" (§22) con nomi veri del portafoglio, se ci sono.
// ponytail: guarda solo i dati del mese già caricati, altrimenti un esempio.
const esempio = computed(() => {
  const cat = dashboard.categorie;
  const ric = cat.flatMap((c) => c.transazionis || []).find((t) => t.TransazioneRicorrente);
  const conBudget = cat.find((c) => (c.Tipo || "uscita") === "uscita" && c.Budget_categoria > 0);
  return { ricorrente: ric?.Descrizione || "Netflix", categoria: conBudget?.Nome || "Spesa" };
});
const stato = ref(null);
const preferenze = reactive({ orario: "08:00", scadenze: null, budget: false });
const attesa = ref("");
const errore = ref("");
const supporto = supportaNotifiche();
const opzioni = [
  { etichetta: "Disattivate", valore: null },
  { etichetta: "Il giorno stesso", valore: 0 },
  { etichetta: "Il giorno prima", valore: 1 },
];

async function operazione(nome, esegui) {
  attesa.value = nome;
  errore.value = "";
  try {
    await esegui();
  } catch (e) {
    if (nome === "prova" && e.response?.status === 404) {
      stato.value.attivo = false;
      errore.value = "L’iscrizione è scaduta. Attiva nuovamente le notifiche.";
    } else if (e.response?.status === 429) {
      errore.value = "Attendi un minuto prima di inviare un’altra prova.";
    } else if (e.name === "NotAllowedError") {
      errore.value = "Consenti le notifiche nelle impostazioni del browser per continuare.";
    } else {
      errore.value = erroreLeggibile(e);
    }
  } finally {
    attesa.value = "";
  }
}

function carica() {
  return operazione("carica", async () => {
    stato.value = await statoNotifiche();
    Object.assign(preferenze, stato.value.preferenze);
  });
}
onMounted(carica);

function salva() {
  return operazione("salva", async () => {
    Object.assign(preferenze, await salvaPreferenze({ ...preferenze }));
    toast.add({ severity: "success", summary: "Preferenze salvate", life: 2500 });
  });
}

function gestisciDispositivo() {
  return operazione("dispositivo", async () => {
    if (stato.value.attivo) {
      await disattivaNotifiche();
      stato.value.attivo = false;
      return;
    }
    stato.value.attivo = await attivaNotifiche(stato.value.publicKey);
    if (!stato.value.attivo) errore.value = "Consenti le notifiche nelle impostazioni del browser per continuare.";
  });
}

function inviaProva() {
  return operazione("prova", async () => {
    await provaNotifiche();
    toast.add({ severity: "success", summary: "Notifica di prova inviata", life: 2500 });
  });
}
</script>

<template>
  <section class="panel reveal">
    <h2 class="text-[28px] leading-[1.05] font-medium tracking-[-0.04em] sm:text-[34px]">Notifiche</h2>
    <p class="mt-3 max-w-[60ch] text-testo2">Scegli quali avvisi ricevere anche quando Budget è chiusa.</p>
  </section>

  <p v-if="errore" role="alert" class="box-errore">{{ errore }}</p>
  <Skeleton v-if="attesa === 'carica'" height="9rem" borderRadius="28px" />
  <button v-else-if="!stato" class="pill-btn pill-btn--cream self-start" @click="carica">Riprova</button>

  <template v-else>
    <form class="panel flex flex-col gap-5" @submit.prevent="salva">
      <div>
        <span id="notifiche-scadenze-label" class="etichetta">Promemoria per le scadenze ricorrenti</span>
        <div class="seg max-sm:grid! max-sm:grid-cols-3 max-sm:text-[12.5px] max-sm:[&>button]:px-1 max-sm:[&>button]:whitespace-normal max-sm:[&>button]:leading-tight max-sm:[&>button]:min-w-0" role="group" aria-labelledby="notifiche-scadenze-label">
          <button v-for="o in opzioni" :key="o.etichetta" type="button" :aria-pressed="preferenze.scadenze === o.valore" @click="preferenze.scadenze = o.valore">{{ o.etichetta }}</button>
        </div>
      </div>

      <div v-if="preferenze.scadenze !== null">
        <label for="notifiche-orario" class="etichetta">Orario del promemoria</label>
        <input id="notifiche-orario" v-model="preferenze.orario" type="time" required class="campo rounded-full!" />
        <p class="mt-2 text-[12.5px] text-testo2">Ora italiana ({{ stato.fuso }})</p>
      </div>

      <label class="flex cursor-pointer items-center justify-between gap-5 border-t border-bordo pt-5">
        <span>
          <b class="block text-[15px] font-medium">Sforamento del budget</b>
          <small class="mt-0.5 block text-[13px] text-testo2">Un avviso per categoria al mese, quando la spesa supera il budget.</small>
        </span>
        <Interruttore v-model="preferenze.budget" etichetta="Sforamento del budget" />
      </label>

      <div class="border-t border-bordo pt-5">
        <b class="block text-[15px] font-medium">Come le vedrai</b>
        <div class="mt-3 flex flex-col gap-2">
          <div v-for="n in [
            { on: preferenze.scadenze !== null, t: `${preferenze.scadenze === 1 ? 'Domani' : 'Oggi'}: ${esempio.ricorrente}`, s: 'Scadenza ricorrente' },
            { on: preferenze.budget, t: `Budget di ${esempio.categoria} superato`, s: 'Apri Budget per i dettagli' },
          ]" :key="n.s" class="flex items-center gap-3 rounded-[18px] bg-campo px-4 py-3 transition-opacity" :class="{ 'opacity-40': !n.on }">
            <span class="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-crema text-inchiostro"><i class="ph-bold ph-wallet" /></span>
            <span class="min-w-0"><b class="block truncate text-[14px] font-medium">{{ n.t }}</b><small class="block text-[12.5px] text-testo2">{{ n.on ? n.s : "Disattivata" }}</small></span>
          </div>
        </div>
        <p class="mt-2 text-[12.5px] text-testo2">Niente cifre sullo schermo bloccato: i dettagli si vedono dentro Budget dopo l’accesso.</p>
      </div>

      <div class="flex justify-end">
        <button type="submit" class="pill-btn pill-btn--cream h-12!" :disabled="!!attesa">Salva preferenze</button>
      </div>
    </form>

    <section class="panel flex flex-col gap-3">
      <h3 class="text-[17px] font-semibold tracking-[-0.015em]">Questo dispositivo</h3>
      <p class="text-sm text-testo2">I dettagli delle spese si vedono dentro Budget dopo l’accesso.</p>
      <p v-if="!stato.publicKey" role="status" class="text-sm text-testo2">Le notifiche push devono ancora essere configurate sul server.</p>
      <p v-else-if="!supporto || !stato.worker" role="status" class="text-sm text-testo2">
        Le notifiche push richiedono un browser compatibile e una connessione HTTPS. Su iPhone, apri Budget dalla schermata Home.
      </p>
      <p v-else role="status" class="flex items-center gap-2 text-sm font-medium">
        <span class="h-2.5 w-2.5 rounded-full" :class="stato.attivo ? 'bg-salvia' : 'bg-testo2'" aria-hidden="true" />{{ stato.attivo ? "Notifiche attive" : "Notifiche disattivate" }}
      </p>

      <div v-if="stato.worker && (stato.attivo || stato.publicKey)" class="flex flex-col gap-2 sm:flex-row">
        <button class="pill-btn h-12!" :class="stato.attivo ? 'pill-btn--ghost' : 'pill-btn--cream'" :disabled="!!attesa" @click="gestisciDispositivo">
          <i class="ph-bold ph-bell" />{{ stato.attivo ? "Disattiva su questo dispositivo" : "Attiva le notifiche" }}
        </button>
        <button v-if="stato.attivo" class="pill-btn pill-btn--ghost h-12!" :disabled="!!attesa" @click="inviaProva">Invia notifica di prova</button>
      </div>
    </section>
  </template>
</template>

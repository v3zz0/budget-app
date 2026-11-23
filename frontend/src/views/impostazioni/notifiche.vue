<script setup>
import { onMounted, reactive, ref } from "vue";
import { useToast } from "primevue/usetoast";
import Interruttore from "@/components/Interruttore.vue";
import { erroreLeggibile } from "@/services/api.js";
import {
  attivaNotifiche, disattivaNotifiche, provaNotifiche, salvaPreferenze,
  statoNotifiche, supportaNotifiche,
} from "@/services/notifiche.js";

const toast = useToast();
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
        <label id="notifiche-scadenze-label" for="notifiche-scadenze" class="etichetta">Promemoria per le scadenze ricorrenti</label>
        <Select v-model="preferenze.scadenze" inputId="notifiche-scadenze" aria-labelledby="notifiche-scadenze-label" :options="opzioni"
          optionLabel="etichetta" optionValue="valore" placeholder="Disattivate" fluid />
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
      <p v-else role="status" class="text-sm font-medium">{{ stato.attivo ? "Notifiche attive" : "Notifiche disattivate" }}</p>

      <div v-if="stato.worker && (stato.attivo || stato.publicKey)" class="flex flex-col gap-2 sm:flex-row">
        <button class="pill-btn h-12!" :class="stato.attivo ? 'pill-btn--ghost' : 'pill-btn--cream'" :disabled="!!attesa" @click="gestisciDispositivo">
          <i class="ph-bold ph-bell" />{{ stato.attivo ? "Disattiva su questo dispositivo" : "Attiva le notifiche" }}
        </button>
        <button v-if="stato.attivo" class="pill-btn pill-btn--ghost h-12!" :disabled="!!attesa" @click="inviaProva">Invia notifica di prova</button>
      </div>
    </section>
  </template>
</template>

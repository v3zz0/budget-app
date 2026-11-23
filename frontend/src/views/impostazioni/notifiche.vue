<script setup>
import { onMounted, reactive, ref } from "vue";
import { useToast } from "primevue/usetoast";
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
  <div class="flex max-w-2xl flex-col gap-5 px-4 pt-6">
    <div>
      <Indietro />
      <h1 class="text-3xl font-bold text-testo">Notifiche</h1>
      <p class="mt-2 text-sm text-testo2">Scegli quali avvisi ricevere anche quando Budget App è chiusa.</p>
    </div>

    <p v-if="errore" role="alert" class="rounded-xl border border-errore/40 bg-errore/15 p-4 text-sm text-errore-testo">{{ errore }}</p>
    <Skeleton v-if="attesa === 'carica'" height="9rem" borderRadius="16px" />
    <Button v-else-if="!stato" label="Riprova" class="self-start" @click="carica" />

    <template v-else>
      <form class="flex flex-col gap-5 rounded-2xl border border-bordo bg-card p-5" @submit.prevent="salva">
        <div class="flex flex-col gap-2">
          <label id="notifiche-scadenze-label" for="notifiche-scadenze" class="font-semibold text-testo">Promemoria per le scadenze ricorrenti</label>
          <Select v-model="preferenze.scadenze" inputId="notifiche-scadenze" aria-labelledby="notifiche-scadenze-label" :options="opzioni"
            optionLabel="etichetta" optionValue="valore" placeholder="Disattivate" fluid />
        </div>

        <div v-if="preferenze.scadenze !== null" class="flex flex-col gap-2">
          <label for="notifiche-orario" class="text-sm font-semibold text-testo">Orario del promemoria</label>
          <input id="notifiche-orario" v-model="preferenze.orario" type="time" required
            class="min-h-11 w-full rounded-lg border border-bordo bg-campo px-3 text-testo" />
          <p class="text-xs text-testo2">Ora italiana ({{ stato.fuso }})</p>
        </div>

        <div class="flex items-start justify-between gap-4 border-t border-bordo pt-5">
          <div>
            <label for="notifiche-budget" class="font-semibold text-testo">Sforamento del budget</label>
            <p class="mt-1 text-sm text-testo2">Un avviso per categoria al mese, quando la spesa supera il budget.</p>
          </div>
          <ToggleSwitch v-model="preferenze.budget" inputId="notifiche-budget" />
        </div>

        <Button type="submit" label="Salva preferenze" icon="pi pi-check" :loading="attesa === 'salva'" :disabled="!!attesa" />
      </form>

      <section class="flex flex-col gap-3 rounded-2xl border border-bordo bg-card p-5">
        <h2 class="text-lg font-bold text-testo">Questo dispositivo</h2>
        <p class="text-sm text-testo2">I dettagli delle spese si vedono dentro Budget App dopo l’accesso.</p>
        <p v-if="!stato.publicKey" role="status" class="text-sm text-testo2">Le notifiche push devono ancora essere configurate sul server.</p>
        <p v-else-if="!supporto || !stato.worker" role="status" class="text-sm text-testo2">
          Le notifiche push richiedono un browser compatibile e una connessione HTTPS. Su iPhone, apri Budget App dalla schermata Home.
        </p>
        <p v-else role="status" class="text-sm font-semibold text-testo">{{ stato.attivo ? "Notifiche attive" : "Notifiche disattivate" }}</p>

        <div v-if="stato.worker && (stato.attivo || stato.publicKey)" class="flex flex-col gap-2 sm:flex-row">
          <Button :label="stato.attivo ? 'Disattiva su questo dispositivo' : 'Attiva le notifiche'"
            :severity="stato.attivo ? 'secondary' : undefined" icon="pi pi-bell"
            :loading="attesa === 'dispositivo'" :disabled="!!attesa" @click="gestisciDispositivo" />
          <Button v-if="stato.attivo" label="Invia notifica di prova" outlined
            :loading="attesa === 'prova'" :disabled="!!attesa" @click="inviaProva" />
        </div>
      </section>
    </template>
  </div>
</template>

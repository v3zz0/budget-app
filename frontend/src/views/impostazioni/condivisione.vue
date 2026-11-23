<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import { annullaInvito, elencaInviti, esciDalPortafoglio, invita, salvaRegola } from "@/services/condivisione.js";
import { caricaConto } from "@/services/dashboard.js";
import { erroreLeggibile } from "@/services/api.js";
import { bilancio, quotaRegola } from "@/utils/conti.js";
import { eur } from "@/utils/formato.js";
import { parseImporto, testoImporto } from "@/utils/movimenti.js";
import Avatar from "@/components/Avatar.vue";

// Pannello Condivisione (progetto.md §12): invito per email verso un utente
// che esiste già (niente email inviate: si accetta dentro l'app).
const confirm = useConfirm();
const toast = useToast();
const walletStore = useWalletStore();
const avviso = (severity, summary, detail) => toast.add({ severity, summary, detail, life: 3500 });

const w = computed(() => walletStore.selectedWallet);
const io = computed(() => walletStore.mioRuolo(w.value));
const partner = computed(() => walletStore.partnerDi(w.value));
const creatore = computed(() => walletStore.personaDi(w.value, "creatore"));
const membro = computed(() => walletStore.personaDi(w.value, "membro"));

const inviti = ref({ ricevuti: [], inviati: [] });
const email = ref("");
const occupato = ref(false);
const conto = ref(0);
const inviato = computed(() => inviti.value.inviati.find((i) => i.wallet?.id === w.value?.documentId));

async function carica() {
  try {
    inviti.value = await elencaInviti();
    conto.value = w.value?.condiviso ? bilancio(await caricaConto(w.value.documentId), io.value, Number(w.value.quotaCreatore ?? 0.5)) : 0;
  } catch (e) {
    avviso("error", "Condivisione", erroreLeggibile(e));
  }
}
onMounted(carica);
watch(() => walletStore.walletId, () => (carica(), daWallet()));

async function manda() {
  occupato.value = true;
  try {
    await invita(w.value.documentId, email.value.trim());
    avviso("success", `Invito inviato a ${email.value.trim()}`, "Lo trova in Home quando entra nell'app.");
    email.value = "";
    await carica();
  } catch (e) {
    avviso("error", "Invito non inviato", erroreLeggibile(e));
  } finally {
    occupato.value = false;
  }
}
async function annulla() {
  try {
    await annullaInvito(inviato.value.id);
    avviso("success", "Invito annullato");
    await carica();
  } catch (e) {
    avviso("error", "Errore", erroreLeggibile(e));
  }
}

// ── Divisione predefinita ────────────────────────────────────────────────────
const regola = reactive({ regolaTipo: "meta", percento: 50, entrateCreatore: "", entrateMembro: "" });
function daWallet() {
  const x = w.value || {};
  Object.assign(regola, {
    regolaTipo: x.regolaTipo || "meta",
    percento: Math.round(Number(x.quotaCreatore ?? 0.5) * 100),
    entrateCreatore: x.entrateCreatore != null ? testoImporto(x.entrateCreatore) : "",
    entrateMembro: x.entrateMembro != null ? testoImporto(x.entrateMembro) : "",
  });
}
daWallet();
const quotaCreatore = computed(() =>
  quotaRegola({
    regolaTipo: regola.regolaTipo,
    quotaCreatore: regola.percento / 100,
    entrateCreatore: parseImporto(regola.entrateCreatore) || 0,
    entrateMembro: parseImporto(regola.entrateMembro) || 0,
  }),
);
// Anteprima dal mio punto di vista
const miaPct = computed(() => Math.round((io.value === "creatore" ? quotaCreatore.value : 1 - quotaCreatore.value) * 100));
async function salva() {
  occupato.value = true;
  try {
    await salvaRegola(w.value.documentId, {
      regolaTipo: regola.regolaTipo,
      quotaCreatore: regola.percento / 100,
      entrateCreatore: parseImporto(regola.entrateCreatore),
      entrateMembro: parseImporto(regola.entrateMembro),
    });
    await walletStore.carica();
    avviso("success", "Divisione salvata", "Vale per i movimenti nuovi: quelli già registrati restano com'erano.");
  } catch (e) {
    avviso("error", "Errore", erroreLeggibile(e));
  } finally {
    occupato.value = false;
  }
}

const pari = computed(() => Math.abs(conto.value) < 0.005);
function esci() {
  confirm.require({
    header: `Uscire da “${w.value.Nome}”?`,
    message: `Il portafoglio resta a ${partner.value?.nome || "l'altra persona"} con tutti i movimenti. Tu non lo vedrai più.`,
    acceptLabel: "Esci dal portafoglio",
    icon: "ph-sign-out",
    accept: async () => {
      try {
        await esciDalPortafoglio(w.value.documentId);
        await walletStore.carica();
        avviso("success", "Sei uscito dal portafoglio");
      } catch (e) {
        avviso("error", "Non puoi uscire", erroreLeggibile(e));
      }
    },
  });
}
</script>

<template>
  <section class="panel">
    <h3 class="mb-5 text-[17px] font-semibold tracking-[-0.015em]">Condivisione</h3>

    <!-- Personale: invito -->
    <template v-if="!w.condiviso">
      <div v-if="!walletStore.creatoDaMe(w)" class="text-sm text-testo2">Solo chi ha creato il portafoglio può invitare.</div>
      <div v-else-if="inviato" class="flex items-center gap-4 rounded-[20px] bg-campo p-4">
        <span class="grid h-11 w-11 flex-none place-items-center rounded-full bg-card text-xl"><i class="ph-bold ph-paper-plane-tilt" /></span>
        <span class="min-w-0 flex-1">
          <b class="block truncate font-medium">{{ inviato.email }}</b>
          <small class="text-[13px] text-testo2">Invito inviato · in attesa che accetti</small>
        </span>
        <button class="inline-flex h-10 items-center rounded-full px-3 text-sm font-medium text-testo2 hover:bg-card hover:text-testo" @click="annulla">Annulla invito</button>
      </div>
      <form v-else class="flex flex-col gap-3" @submit.prevent="manda">
        <p class="max-w-[60ch] text-sm text-testo2">
          Condividi questo portafoglio con una persona sola: vedrà solo questo portafoglio, mai gli altri tuoi. Serve che abbia già un
          account.
        </p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <input v-model="email" type="email" placeholder="email della persona" autocomplete="off" class="campo flex-1 rounded-full!" aria-label="Email della persona da invitare" />
          <button class="pill-btn pill-btn--cream h-[52px]!" type="submit" :disabled="occupato || !email.trim()"><i class="ph-bold ph-paper-plane-tilt" />Invia invito</button>
        </div>
      </form>
    </template>

    <!-- Condiviso -->
    <template v-else>
      <div class="flex flex-col gap-2">
        <div v-for="p in [{ ruolo: 'creatore', persona: creatore, t: 'ha creato il portafoglio' }, { ruolo: 'membro', persona: membro, t: 'membro' }]" :key="p.ruolo" class="flex items-center gap-4 rounded-[20px] bg-campo p-4">
          <Avatar :p="p.persona" :size="40" />
          <span class="min-w-0 flex-1">
            <b class="block truncate font-medium">{{ p.persona?.nome }}<template v-if="io === p.ruolo"> (tu)</template></b>
            <small class="text-[13px] text-testo2">{{ p.t }}</small>
          </span>
        </div>
      </div>
      <p class="mt-4 flex items-start gap-2 rounded-[14px] bg-fondo px-5 py-4 text-[13.5px]">
        <i class="ph-bold ph-lock-simple mt-0.5 text-fg-accento" />
        {{ partner?.nome }} vede solo questo portafoglio: i tuoi altri portafogli restano privati. Tutti e due aggiungete e modificate i movimenti.
      </p>

      <div class="mt-6">
        <b class="mb-3 block text-[15px] font-medium">Divisione predefinita</b>
        <div class="seg mb-4 flex! flex-wrap" role="group" aria-label="Divisione predefinita">
          <button type="button" :aria-pressed="regola.regolaTipo === 'meta'" @click="regola.regolaTipo = 'meta'">A metà</button>
          <button type="button" :aria-pressed="regola.regolaTipo === 'proporzionale'" @click="regola.regolaTipo = 'proporzionale'">In proporzione alle entrate</button>
          <button type="button" :aria-pressed="regola.regolaTipo === 'personalizzata'" @click="regola.regolaTipo = 'personalizzata'">Personalizzata</button>
        </div>
        <div v-if="regola.regolaTipo === 'proporzionale'" class="mb-4 grid gap-4 md:grid-cols-2">
          <div><label class="etichetta" for="e-cr">Entrate di {{ creatore?.nome }} al mese</label><input id="e-cr" v-model="regola.entrateCreatore" inputmode="decimal" class="campo rounded-full!" placeholder="0" /></div>
          <div><label class="etichetta" for="e-mb">Entrate di {{ membro?.nome }} al mese</label><input id="e-mb" v-model="regola.entrateMembro" inputmode="decimal" class="campo rounded-full!" placeholder="0" /></div>
        </div>
        <div v-if="regola.regolaTipo === 'personalizzata'" class="mb-4">
          <input v-model.number="regola.percento" type="range" min="0" max="100" step="5" class="w-full accent-[var(--color-testo)]" :aria-label="`Parte di ${creatore?.nome}`" />
          <div class="mt-1 flex justify-between text-[13px] font-semibold"><span>{{ creatore?.nome }} {{ regola.percento }}%</span><span>{{ membro?.nome }} {{ 100 - regola.percento }}%</span></div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-fondo px-5 py-4 text-[13.5px]">
          <span>Tu <b class="num">{{ miaPct }}%</b> · {{ partner?.nome }} <b class="num">{{ 100 - miaPct }}%</b></span>
          <button class="pill-btn pill-btn--cream h-10! px-4! text-sm!" :disabled="occupato" @click="salva">Salva divisione</button>
        </div>
        <p class="mt-2 text-[12.5px] text-testo2">Si salva su ogni movimento: cambiarla non modifica i conti passati.</p>
      </div>

      <div class="mt-6 flex flex-col items-start gap-2 border-t border-bordo pt-5">
        <template v-if="io === 'membro'">
          <button
            class="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-fg-avviso hover:bg-campo disabled:opacity-45"
            :disabled="!pari"
            @click="esci"
          >
            <i class="ph-bold ph-sign-out" />Esci dal portafoglio
          </button>
          <p v-if="!pari" class="text-[12.5px] text-testo2">
            Prima saldate i conti: {{ conto > 0 ? `${partner?.nome} ti deve ${eur(conto)}` : `devi ${eur(-conto)} a ${partner?.nome}` }} (Salda in Home).
          </p>
        </template>
        <p v-else class="text-[12.5px] text-testo2">Eliminandolo sparisce anche per {{ partner?.nome }}.</p>
      </div>
    </template>
  </section>
</template>

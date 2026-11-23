<script setup>
import { computed, onMounted, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useConsigliStore } from "@/stores/consigli.js";
import { useDashboardStore, somma } from "@/stores/dashboard.js";
import { useWalletStore } from "@/stores/wallet.js";
import { eliminaTransazione } from "@/services/transazioni.js";
import { creaWallet } from "@/services/impostazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { coloreImporto, dataIt, euro, nomeMese } from "@/utils/budget.js";

const router = useRouter();
const route = useRoute();
const confirm = useConfirm();
const toast = useToast();
const dashboard = useDashboardStore();
const walletStore = useWalletStore();
const consigli = useConsigliStore();

const espanse = reactive(new Set());

// Primo avvio: l'account lo crea l'amministratore e parte senza nulla.
const primo = reactive({ nome: "", budget: null, salvando: false });
async function creaPrimo() {
  primo.salvando = true;
  try {
    const creato = await creaWallet(primo.nome.trim(), primo.budget ?? 0);
    await walletStore.carica();
    const w = walletStore.wallets.find((x) => x.documentId === creato.documentId);
    if (w) walletStore.setSelectedWallet(w);
  } catch (e) {
    toast.add({ severity: "error", summary: "Portafoglio non creato", detail: erroreLeggibile(e), life: 4000 });
  } finally {
    primo.salvando = false;
  }
}

// I consigli li genera il cron a fine mese: qui si leggono e basta.
onMounted(() => consigli.carica());

// Carica al primo ingresso e a ogni cambio di portafoglio. Il mese lo
// ricarica dal server a ogni cambio (cambiaMese), non si filtra sul client.
watch(() => walletStore.walletId, (id) => id && dashboard.carica(id), { immediate: true });

watch([() => route.query, () => walletStore.caricati], ([query, caricati]) => {
  if (!caricati || typeof query.portafoglio !== "string" || typeof query.categoria !== "string" ||
      typeof query.mese !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(query.mese)) return;
  const wallet = walletStore.wallets.find((w) => w.documentId === query.portafoglio);
  if (!wallet) return;
  const [anno, mese] = query.mese.split("-").map(Number);
  const meseCambiato = dashboard.mese.anno !== anno || dashboard.mese.mese !== mese;
  dashboard.mese = { anno, mese };
  espanse.add(query.categoria);
  if (walletStore.walletId !== wallet.documentId) walletStore.setSelectedWallet(wallet);
  else if (meseCambiato) dashboard.carica(wallet.documentId);
}, { immediate: true });

const righe = computed(() =>
  dashboard.categorie.map((c) => {
    const budget = c.Budget_categoria || 0;
    const spesi = somma(c.transazionis);
    const quota = budget > 0 ? spesi / budget : 0;
    return {
      ...c,
      budget,
      spesi,
      rimanente: budget - spesi,
      riempimento: Math.min(quota, 1) * 100,
      // quanto si è sforato, in frazione di budget: la barra da sola è
      // clampata, e al 110% e al 300% sarebbe identica
      oltre: Math.min(Math.max(quota - 1, 0), 1),
    };
  }),
);

watch(() => righe.value.find((c) => c.documentId === route.query.categoria)?.documentId, (id) => {
  if (id) document.getElementById(`categoria-${id}`)?.scrollIntoView({ block: "nearest" });
}, { flush: "post" });

const toggle = (id) => (espanse.has(id) ? espanse.delete(id) : espanse.add(id));

function elimina(t) {
  confirm.require({
    header: "Elimina transazione",
    message: `Eliminare "${t.Descrizione || "senza descrizione"}" (${euro(t.Importo, 2)})?`,
    acceptLabel: "Elimina",
    rejectLabel: "Annulla",
    acceptProps: { severity: "danger" },
    rejectProps: { severity: "secondary", text: true },
    accept: async () => {
      try {
        await eliminaTransazione(t.documentId);
        await dashboard.carica();
      } catch (e) {
        toast.add({ severity: "error", summary: "Errore", detail: erroreLeggibile(e), life: 4000 });
      }
    },
  });
}
</script>

<template>
  <div class="flex flex-col gap-4 px-4 pt-6">
    <!-- Testata: eyebrow + navigatore mese (non nel primo avvio: senza portafoglio non ha senso) -->
    <div v-if="walletStore.wallets.length || !walletStore.caricati" class="flex items-center justify-between gap-2">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-testo2">
          {{ walletStore.selectedWallet?.Nome || "Portafoglio" }}
        </p>
        <div class="mt-1 flex items-center gap-1">
          <Button icon="pi pi-chevron-left" text rounded severity="secondary" aria-label="Mese precedente" @click="dashboard.cambiaMese(-1)" />
          <h1 class="min-w-44 text-center text-2xl font-bold text-testo">
            {{ nomeMese(dashboard.mese.mese) }} {{ dashboard.mese.anno }}
          </h1>
          <Button icon="pi pi-chevron-right" text rounded severity="secondary" aria-label="Mese successivo" @click="dashboard.cambiaMese(1)" />
        </div>
      </div>
      <div class="flex items-center">
        <!-- Campanella dei consigli: il pallino compare solo se c'è qualcosa di nuovo -->
        <span class="relative">
          <Button
            :icon="consigli.nonLetti ? 'pi pi-bell text-accent' : 'pi pi-bell'"
            text
            rounded
            severity="secondary"
            aria-label="Consigli sul budget"
            @click="router.push('/consigli')"
          />
          <span
            v-if="consigli.nonLetti"
            class="pointer-events-none absolute -right-0.5 top-0 grid min-w-4 place-items-center rounded-full bg-errore px-1 text-[10px] font-bold text-fondo"
          >{{ consigli.nonLetti }}</span>
        </span>
        <Button icon="pi pi-chart-bar" text rounded severity="secondary" aria-label="Riepilogo anno" @click="router.push('/anno')" />
      </div>
    </div>

    <!-- Primo avvio -->
    <section v-if="walletStore.caricati && !walletStore.wallets.length" class="rounded-2xl border border-bordo bg-card p-5">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Primo avvio</p>
      <h2 class="mt-1 text-2xl font-bold text-testo">Iniziamo dal primo portafoglio</h2>
      <p class="mt-2 text-sm text-testo2">
        Un portafoglio raccoglie le spese e i budget di una parte della tua vita (per esempio la casa, o le spese
        personali). Ne puoi creare altri in seguito da Impostazioni.
      </p>
      <form class="mt-4 flex flex-col gap-4" @submit.prevent="creaPrimo">
        <div class="flex flex-col gap-2">
          <label for="primo-nome" class="text-sm text-testo2">Nome</label>
          <InputText id="primo-nome" v-model="primo.nome" placeholder="Casa" fluid />
        </div>
        <div class="flex flex-col gap-2">
          <label for="primo-budget" class="text-sm text-testo2">Budget mensile</label>
          <InputNumber v-model="primo.budget" inputId="primo-budget" mode="currency" currency="EUR" locale="it-IT" :min="0" fluid />
        </div>
        <Button type="submit" label="Crea il portafoglio" :loading="primo.salvando" :disabled="!primo.nome.trim()" />
      </form>
    </section>

    <!-- I portafogli stanno ancora arrivando -->
    <Skeleton v-else-if="!walletStore.selectedWallet" height="8rem" borderRadius="16px" />

    <!-- Errore -->
    <div v-else-if="dashboard.errore" class="rounded-xl border border-errore/40 bg-errore/15 p-4 text-errore-testo">
      {{ dashboard.errore }}
    </div>

    <!-- Caricamento -->
    <template v-else-if="dashboard.loading && !righe.length">
      <div class="grid grid-cols-3 gap-2"><Skeleton v-for="i in 3" :key="i" height="4.5rem" borderRadius="12px" /></div>
      <Skeleton v-for="i in 4" :key="i" height="5rem" borderRadius="12px" />
    </template>

    <template v-else>
      <!-- Tre card: Budget / Spesi / Rimanenti. Il rimanente porta il segno,
           non solo il colore. -->
      <div class="grid grid-cols-3 gap-2" :class="{ 'opacity-60': dashboard.loading }">
        <div class="rounded-xl border border-bordo bg-card px-2 py-3 text-center">
          <p class="text-[11px] text-testo2">Budget</p>
          <p class="mt-1 text-base font-bold text-testo2">{{ euro(dashboard.totaleBudget) }}</p>
        </div>
        <div class="rounded-xl border border-bordo bg-card px-2 py-3 text-center">
          <p class="text-[11px] text-testo2">Spesi</p>
          <p class="mt-1 text-base font-bold text-testo">{{ euro(dashboard.totaleSpesi) }}</p>
        </div>
        <div class="rounded-xl border border-bordo bg-card px-2 py-3 text-center">
          <p class="text-[11px] text-testo2">Rimanenti</p>
          <p class="mt-1 text-base font-bold" :class="coloreImporto(dashboard.totaleRimanente)">
            {{ euro(dashboard.totaleRimanente) }}
          </p>
        </div>
      </div>

      <!-- Proiezione: solo se il ritmo porta a sforare (i consigli di fine
           mese arrivano a mese già chiuso) -->
      <div v-if="dashboard.proiezionePreoccupante" class="flex gap-3 rounded-xl border border-avviso/40 bg-avviso/10 p-3">
        <i class="pi pi-chart-line mt-0.5 text-avviso" />
        <div>
          <p class="text-sm font-semibold text-testo">Di questo passo sfori</p>
          <p class="text-xs text-testo2">
            Chiuderesti il mese a {{ euro(dashboard.proiezione) }}, cioè
            {{ euro(dashboard.proiezione - dashboard.totaleBudget) }} sopra il budget.
          </p>
        </div>
      </div>

      <!-- Portafoglio creato ma ancora senza categorie: è lì che si registrano le spese -->
      <div v-if="!righe.length" class="flex flex-col items-center gap-3 rounded-2xl border border-bordo bg-card px-6 py-8 text-center">
        <p class="font-semibold text-testo">Ora le categorie</p>
        <p class="text-sm text-testo2">
          Dividi il budget in categorie (spesa, bollette, auto…): le transazioni si registrano dentro una categoria.
        </p>
        <Button label="Aggiungi le categorie" icon="pi pi-plus" @click="router.push('/impostazioni/categorie')" />
      </div>

      <!-- Categorie espandibili -->
      <div v-for="c in righe" :id="`categoria-${c.documentId}`" :key="c.documentId" class="rounded-xl border border-bordo bg-card">
        <button
          type="button"
          class="w-full rounded-xl p-4 text-left"
          :aria-expanded="espanse.has(c.documentId)"
          @click="toggle(c.documentId)"
        >
          <div class="flex items-center gap-2">
            <span v-if="c.icona" class="text-lg">{{ c.icona }}</span>
            <span class="flex-1 font-semibold text-testo">{{ c.Nome }}</span>
            <span class="text-sm text-testo2">{{ euro(c.spesi) }} / {{ euro(c.budget) }}</span>
            <span class="text-sm font-semibold" :class="coloreImporto(c.rimanente)">{{ euro(c.rimanente) }}</span>
            <i class="pi text-testo2" :class="espanse.has(c.documentId) ? 'pi-chevron-up' : 'pi-chevron-down'" />
          </div>
          <!-- Due segmenti quando si sfora: budget consumato + quanto oltre -->
          <div class="mt-3 flex gap-[3px]">
            <div class="h-1.5 overflow-hidden rounded bg-campo" style="flex: 100 1 0">
              <div class="h-full" :class="c.rimanente < 0 ? 'bg-errore' : 'bg-positivo'" :style="{ width: c.riempimento + '%' }" />
            </div>
            <div v-if="c.oltre > 0" class="h-1.5 rounded bg-errore" :style="{ flex: `${Math.max(1, Math.round(c.oltre * 100))} 1 0` }" />
          </div>
        </button>

        <div v-if="espanse.has(c.documentId)" class="border-t border-bordo">
          <p v-if="!c.transazionis.length" class="p-4 text-sm text-testo2">Nessuna transazione questo mese</p>
          <div
            v-for="t in c.transazionis"
            :key="t.documentId"
            class="flex items-center gap-3 px-4 py-2.5 hover:bg-campo/50"
          >
            <button type="button" class="flex-1 text-left" @click="router.push(`/transazioni/${t.documentId}`)">
              <p class="text-sm text-testo">{{ t.Descrizione || "—" }}</p>
              <p class="text-[11px] text-testo2">{{ dataIt(t.Data) }}</p>
            </button>
            <i v-if="t.TransazioneRicorrente" class="pi pi-replay text-xs text-testo2" title="Ricorrente" />
            <span class="text-sm font-semibold text-testo">{{ euro(t.Importo, 2) }}</span>
            <Button icon="pi pi-trash" severity="danger" text rounded size="small" aria-label="Elimina" @click="elimina(t)" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

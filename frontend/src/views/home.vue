<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useConsigliStore } from "@/stores/consigli.js";
import { useDashboardStore } from "@/stores/dashboard.js";
import { useWalletStore } from "@/stores/wallet.js";
import { creaWallet } from "@/services/impostazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { nomeMese, spostaMese } from "@/utils/budget.js";
import { eur } from "@/utils/formato.js";
import { appiattisci, totali } from "@/utils/movimenti.js";
import { budgetCategorie, fette, variazione } from "@/utils/home.js";
import Ciambella from "@/components/Ciambella.vue";
import Avatar from "@/components/Avatar.vue";
import { accettaInvito, elencaInviti, rifiutaInvito } from "@/services/condivisione.js";
import { creaTransazione } from "@/services/transazioni.js";
import { statoSalvadanaio } from "@/services/salvadanaio.js";
import { altro, bilancio, miaQuota, saldoCassa, ultimoPareggio } from "@/utils/conti.js";
import { isoLocale, parseImporto, testoImporto } from "@/utils/movimenti.js";

const router = useRouter();
const route = useRoute();
const toast = useToast();
const dashboard = useDashboardStore();
const walletStore = useWalletStore();
const consigli = useConsigliStore();

// Primo avvio: l'account lo crea l'amministratore e parte senza nulla.
const primo = reactive({ nome: "", budget: null, salvando: false });
async function creaPrimo() {
  primo.salvando = true;
  try {
    const creato = await creaWallet(primo.nome.trim(), parseImporto(primo.budget || "0") ?? 0);
    await walletStore.carica();
    const w = walletStore.wallets.find((x) => x.documentId === creato.documentId);
    if (w) walletStore.setSelectedWallet(w);
    // Subito alle categorie: senza non si registra niente
    router.push("/impostazioni#categorie");
  } catch (e) {
    toast.add({ severity: "error", summary: "Portafoglio non creato", detail: erroreLeggibile(e), life: 4000 });
  } finally {
    primo.salvando = false;
  }
}

// Salvadanaio del portafoglio scelto, per il blocco in fondo (progetto.md §15)
const salvadanaio = ref(null);
watch(
  () => walletStore.walletId,
  async (id) => {
    salvadanaio.value = null;
    if (id) salvadanaio.value = await statoSalvadanaio(id).catch(() => null);
  },
  { immediate: true },
);
const cartelle = computed(() => salvadanaio.value?.cartelle || []);
const totaleSalvadanaio = computed(() => cartelle.value.reduce((s, c) => s + c.saldo, 0));
// I tre salvadanai più ricchi
const piuRicchi = computed(() => [...cartelle.value].sort((a, b) => b.saldo - a.saldo).slice(0, 3));

// I consigli li genera il cron a fine mese: qui si leggono e basta.
onMounted(() => consigli.carica());
watch(() => walletStore.walletId, (id) => id && dashboard.carica(id), { immediate: true });

// Link di una notifica di sforamento: ?portafoglio=&categoria=&mese=AAAA-MM
const evidenzia = ref(null);
watch([() => route.query, () => walletStore.caricati], ([query, caricati]) => {
  if (!caricati || typeof query.portafoglio !== "string" || typeof query.mese !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(query.mese)) return;
  const wallet = walletStore.wallets.find((w) => w.documentId === query.portafoglio);
  if (!wallet) return;
  const [anno, mese] = query.mese.split("-").map(Number);
  const cambiato = dashboard.mese.anno !== anno || dashboard.mese.mese !== mese;
  dashboard.mese = { anno, mese };
  evidenzia.value = typeof query.categoria === "string" ? query.categoria : null;
  if (walletStore.walletId !== wallet.documentId) walletStore.setSelectedWallet(wallet);
  else if (cambiato) dashboard.carica(wallet.documentId);
}, { immediate: true });

// ── Inviti ricevuti: si accettano qui ────────────────────────────────────────
const inviti = ref([]);
onMounted(async () => {
  try {
    inviti.value = (await elencaInviti()).ricevuti;
  } catch {
    /* senza inviti la Home funziona lo stesso */
  }
});
async function rispondi(i, si) {
  try {
    if (si) {
      const { wallet } = await accettaInvito(i.id);
      await walletStore.carica();
      const w = walletStore.wallets.find((x) => x.documentId === wallet);
      if (w) walletStore.setSelectedWallet(w);
      toast.add({ severity: "success", summary: `Ora condividi “${i.wallet.nome}” con ${i.da}`, life: 3500 });
    } else {
      await rifiutaInvito(i.id);
    }
    inviti.value = inviti.value.filter((x) => x.id !== i.id);
  } catch (e) {
    toast.add({ severity: "error", summary: "Invito", detail: erroreLeggibile(e), life: 4000 });
  }
}

// ── Portafoglio condiviso ───────────────────────────────────────────────────
const wallet = computed(() => walletStore.selectedWallet);
const condiviso = computed(() => !!wallet.value?.condiviso);
const io = computed(() => walletStore.mioRuolo(wallet.value));
const partner = computed(() => walletStore.partnerDi(wallet.value));
const regola = computed(() => Number(wallet.value?.quotaCreatore ?? 0.5));
const miaParte = ref(false); // "Totale / La mia parte"
const conto = computed(() => (condiviso.value ? bilancio(dashboard.conto, io.value, regola.value) : 0));
const pari = computed(() => Math.abs(conto.value) < 0.005);
const cassa = computed(() => saldoCassa(dashboard.conto));
const dataPareggio = computed(() => ultimoPareggio(dashboard.conto, regola.value));
const inCassaMese = (r) => movimenti.value.filter((m) => m.tipo === "versamento" && m.pagatoDa === r).reduce((s, m) => s + m.Importo * 1, 0);
const spesoCassaMese = computed(() => movimenti.value.filter((m) => m.tipo === "uscita" && m.pagatoDa === "cassa").reduce((s, m) => s + m.importo, 0));
// Con "La mia parte" ogni importo diventa la mia quota del movimento
const scala = (lista) => (miaParte.value && condiviso.value ? lista.map((m) => ({ ...m, importo: Math.round(m.importo * miaQuota(m.quota, io.value, regola.value) * 100) / 100 })) : lista);
const divisione = (m) => {
  const q = miaQuota(m.quota, io.value, regola.value);
  return q === 0.5 ? "a metà" : q === 1 ? "tutta tua" : q === 0 ? `tutta di ${partner.value?.nome}` : `${Math.round(q * 100)}% tu`;
};
const chiPaga = (m) => {
  if (m.pagatoDa === "cassa") return "dalla cassa";
  const p = m.pagatoDa === io.value ? "te" : partner.value?.nome;
  return m.tipo === "entrata" ? `ricevuta da ${p}` : `pagato da ${p}`;
};

// Salda: registra un rimborso, anche parziale
const salda = reactive({ aperto: false, importo: "", salvando: false });
const daChi = computed(() => (conto.value < 0 ? io.value : altro(io.value))); // chi dà i soldi
function apriSalda() {
  Object.assign(salda, { aperto: true, importo: testoImporto(Math.abs(conto.value)) });
}
async function registraRimborso() {
  const v = parseImporto(salda.importo);
  if (!(v > 0)) return toast.add({ severity: "warn", summary: "Inserisci un importo valido", life: 3000 });
  const cat = dashboard.categorie.find((c) => c.Tipo === "rimborso");
  if (!cat) return toast.add({ severity: "error", summary: "Manca la categoria dei rimborsi", life: 4000 });
  salda.salvando = true;
  try {
    await creaTransazione({ importo: v, descrizione: "Rimborso", data: isoLocale(new Date()), ricorrente: false, contanti: false, categoriaId: cat.documentId, pagatoDa: daChi.value });
    salda.aperto = false;
    await dashboard.carica();
    toast.add({ severity: "success", summary: pari.value ? "Siete in pari" : `Rimborso registrato · ${conto.value > 0 ? `${partner.value?.nome} ti deve ${eur(conto.value)}` : `devi ${eur(-conto.value)} a ${partner.value?.nome}`}`, life: 4000 });
  } catch (e) {
    toast.add({ severity: "error", summary: "Rimborso non registrato", detail: erroreLeggibile(e), life: 4000 });
  } finally {
    salda.salvando = false;
  }
}

const nome = computed(() => nomeMese(dashboard.mese.mese));
const movimenti = computed(() => appiattisci(dashboard.categorie));
const tot = computed(() => totali(scala(movimenti.value)));
const prima = computed(() => totali(scala(appiattisci(dashboard.precedente))));
const mesePrima = computed(() => spostaMese(dashboard.mese, -1).mese);
const spesoPct = computed(() => (tot.value.entrate ? Math.min(100, Math.round((tot.value.uscite / tot.value.entrate) * 100)) : tot.value.uscite ? 100 : 0));
const tasso = computed(() => (tot.value.entrate ? Math.round((tot.value.saldo / tot.value.entrate) * 100) : 0));

// Grafico: Totale (entrate vs uscite) o per categoria
const vista = ref("totale");
const grafico = computed(() => {
  const t = tot.value;
  if (vista.value === "totale") {
    return {
      fette: [
        { id: "e", nome: "Entrate", valore: t.entrate, colore: "var(--color-salvia)" },
        { id: "u", nome: "Uscite", valore: t.uscite, colore: "var(--color-arancio)" },
      ].filter((f) => f.valore > 0),
      // Nel condiviso il saldo di casa non ha senso: al centro le uscite sul budget
      centro: condiviso.value
        ? { etichetta: miaParte.value ? "La tua parte" : "Uscite", valore: t.uscite, sotto: miaParte.value ? "delle uscite di casa" : `${Math.round((t.uscite / (Number(wallet.value?.Budget) || 1)) * 100)}% del budget` }
        : { etichetta: "Saldo", valore: t.saldo, sotto: t.entrate ? `speso il ${spesoPct.value}%` : "" },
    };
  }
  const tipo = vista.value === "entrate" ? "entrata" : "uscita";
  const f = fette(miaParte.value && condiviso.value ? dashboard.categorie.map((c) => ({ ...c, transazionis: scala((c.transazionis || []).map((t) => ({ ...t, importo: Number(t.Importo) }))).map((t) => ({ ...t, Importo: t.importo })) })) : dashboard.categorie, tipo);
  return {
    fette: f,
    centro: {
      etichetta: tipo === "entrata" ? "Entrate" : "Uscite",
      valore: tipo === "entrata" ? t.entrate : t.uscite,
      sotto: `${f.length} ${f.length === 1 ? "categoria" : "categorie"}`,
    },
  };
});

const ultimi = computed(() => movimenti.value.slice(0, 6));
const budget = computed(() => budgetCategorie(dashboard.categorie));
const breve = (d) => `${Number(d.slice(8, 10))} ${nome.value.slice(0, 3).toLowerCase()}`;
</script>

<template>
  <div>
    <!-- Inviti ricevuti -->
      <section v-for="i in inviti" :key="i.id" class="blocco reveal mb-3 flex flex-wrap items-center justify-between gap-4 bg-crema">
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid h-11 w-11 flex-none place-items-center rounded-full bg-inchiostro-velo text-xl"><i class="ph-bold ph-users-three" /></span>
          <div class="min-w-0">
            <b class="block font-semibold">{{ i.da }} ti invita in “{{ i.wallet.nome }}”</b>
            <small class="text-[13px]">Vedrete tutti e due solo questo portafoglio, con il conto tra voi.</small>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="pill-btn pill-btn--ghost h-11! px-5! text-inchiostro! shadow-[inset_0_0_0_1.5px_var(--color-inchiostro-linea)]!" @click="rispondi(i, false)">Rifiuta</button>
          <button class="pill-btn pill-btn--ink h-11! px-5!" @click="rispondi(i, true)">Accetta</button>
        </div>
      </section>

    <!-- Primo avvio (si salta se c'è un invito da accettare) -->
    <section v-if="walletStore.caricati && !walletStore.wallets.length" class="blocco reveal mx-auto max-w-xl bg-crema" :class="{ hidden: inviti.length }">
      <span class="chip">Primo avvio</span>
      <h1 class="mt-5 text-[34px] leading-[1.05] font-medium tracking-[-0.04em]">Iniziamo dal primo portafoglio</h1>
      <p class="mt-3 text-[15px]">
        Un portafoglio raccoglie spese, entrate e budget di una parte della tua vita (la casa, le spese personali). Ne
        puoi creare altri dalle Impostazioni.
      </p>
      <form class="mt-6 flex flex-col gap-4" @submit.prevent="creaPrimo">
        <div>
          <label for="primo-nome" class="mb-2 block text-sm font-semibold">Nome</label>
          <input id="primo-nome" v-model="primo.nome" placeholder="Casa" class="h-[52px] w-full rounded-full bg-inchiostro-velo px-5 outline-none focus:shadow-[inset_0_0_0_2px_var(--color-inchiostro)]" />
        </div>
        <div>
          <label for="primo-budget" class="mb-2 block text-sm font-semibold">Budget mensile</label>
          <input id="primo-budget" v-model="primo.budget" inputmode="decimal" placeholder="Es. 1.200" class="h-[52px] w-full rounded-full bg-inchiostro-velo px-5 outline-none focus:shadow-[inset_0_0_0_2px_var(--color-inchiostro)]" />
        </div>
        <button type="submit" class="pill-btn pill-btn--ink mt-2" :disabled="primo.salvando || !primo.nome.trim()">Crea il portafoglio</button>
      </form>
    </section>

    <template v-else>
      <!-- Il titolo si prende lo spazio libero: se le icone stanno sulla sua riga
           restano a destra, se vanno a capo partono da sinistra (progetto.md §19) -->
      <div class="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
        <div class="flex-[1_1_auto]">
          <div class="eyebrow">Riepilogo del mese</div>
          <h1 class="display">{{ nome }} <span class="text-testo3">{{ dashboard.mese.anno }}</span></h1>
        </div>
        <div class="flex flex-wrap items-center justify-start gap-2">
          <div v-if="condiviso" class="seg mr-1" role="group" aria-label="Quali importi mostrare">
            <button :aria-pressed="!miaParte" @click="miaParte = false">Totale</button>
            <button :aria-pressed="miaParte" @click="miaParte = true">La mia parte</button>
          </div>
          <!-- condiviso su telefono: "Totale / La mia parte" su una riga, le quattro icone sotto -->
          <span v-if="condiviso" class="hidden basis-full max-[640px]:block" aria-hidden="true" />
          <router-link
            to="/consigli"
            class="circle-btn relative"
            :aria-label="consigli.daGuardare ? `Consigli sul budget, ${consigli.daGuardare} da guardare` : 'Consigli sul budget'"
            title="Consigli sul budget"
          >
            <i class="ph-bold ph-bell" />
            <span v-if="consigli.daGuardare" class="num absolute -top-[3px] -right-[3px] h-5 min-w-5 rounded-full bg-arancio px-[5px] text-center text-[11.5px] leading-5 font-semibold text-inchiostro ring-[3px] ring-fondo">{{ consigli.daGuardare }}</span>
          </router-link>
          <router-link to="/anno" class="circle-btn" aria-label="Riepilogo dell'anno" title="Riepilogo dell'anno"><i class="ph-bold ph-chart-bar" /></router-link>
          <span class="mx-1 h-6 w-px self-center bg-bordo-forte" aria-hidden="true" />
          <button class="circle-btn" aria-label="Mese precedente" @click="dashboard.cambiaMese(-1)"><i class="ph-bold ph-caret-left" /></button>
          <button class="circle-btn" aria-label="Mese successivo" @click="dashboard.cambiaMese(1)"><i class="ph-bold ph-caret-right" /></button>
        </div>
      </div>

      <div v-if="dashboard.errore" class="box-errore mb-3">{{ dashboard.errore }}</div>
      <Skeleton v-else-if="!walletStore.selectedWallet || (dashboard.loading && !dashboard.categorie.length)" height="22rem" borderRadius="28px" class="mb-3" />

      <template v-else>
        <!-- Numeri del mese -->
        <section class="mb-3 grid grid-cols-12 gap-2 sm:gap-3" :class="{ 'opacity-60': dashboard.loading }" aria-label="Numeri del mese">
          <!-- Condiviso: "Tra voi" al posto del saldo -->
          <article v-if="condiviso" class="blocco reveal col-span-12 flex min-h-[148px] flex-col gap-6 bg-crema sm:p-8 min-[981px]:col-span-6 min-[981px]:row-span-2">
            <div class="flex items-center justify-between">
              <span class="text-[15px] font-medium">Tra voi</span>
              <span class="flex"><Avatar :p="walletStore.io" :size="40" /><Avatar :p="partner" :size="40" class="-ml-3 ring-[3px] ring-crema" /></span>
            </div>
            <div class="flex flex-1 flex-col justify-end gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div class="text-base leading-tight font-medium">
                {{ pari ? "Nessun debito" : conto > 0 ? `${partner?.nome} ti deve` : `Devi a ${partner?.nome}` }}
                <b class="my-2 block text-[clamp(56px,7.4vw,92px)] leading-none font-normal tracking-[-0.055em]"><Euro :v="Math.abs(conto)" /></b>
                <template v-if="pari">Siete in pari</template>
              </div>
              <button v-if="!pari" class="pill-btn pill-btn--ink h-[52px]! self-start px-8! sm:self-auto" @click="apriSalda">Salda</button>
            </div>
            <div class="border-t-[1.5px] border-inchiostro-linea pt-4 text-[13.5px] font-medium">
              {{ dataPareggio ? `Ultimo pareggio il ${dataPareggio.split("-").reverse().join("/")} · conta tutti i movimenti da allora` : "Conta tutti i movimenti del portafoglio" }}
            </div>
          </article>
          <article v-else class="blocco reveal col-span-12 flex min-h-[148px] flex-col justify-between gap-6 bg-crema sm:p-8 min-[981px]:col-span-6 min-[981px]:row-span-2">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <span class="text-[15px] font-medium">Saldo di {{ nome.toLowerCase() }}</span>
              <span class="chip whitespace-nowrap">{{ !tot.entrate && !tot.uscite ? "nessun movimento" : tot.saldo >= 0 ? "in attivo" : "in passivo" }}</span>
            </div>
            <div class="text-[clamp(56px,7.4vw,92px)] leading-none tracking-[-0.055em]"><Euro :v="tot.saldo" /></div>
            <div class="flex flex-col gap-2.5">
              <div class="bar h-2.5! bg-inchiostro-velo!" role="img" :aria-label="`Speso il ${spesoPct}% delle entrate`">
                <span class="bg-inchiostro!" :style="{ width: `${spesoPct}%` }" />
              </div>
              <div class="flex justify-between text-[13.5px] font-medium"><span>Speso {{ spesoPct }}%</span><span>Resta {{ Math.max(0, 100 - spesoPct) }}%</span></div>
            </div>
          </article>
          <article class="blocco reveal col-span-6 flex min-h-[148px] flex-col justify-between gap-6 bg-salvia sm:min-h-[176px] min-[981px]:col-span-3" style="--i: 1">
            <div class="flex flex-wrap items-start justify-between gap-2"><span class="text-[15px] font-medium">Entrate</span><span class="chip whitespace-nowrap">{{ variazione(tot.entrate, prima.entrate, mesePrima) }}</span></div>
            <div class="text-[clamp(20px,7vw,28px)] leading-none whitespace-nowrap sm:text-[40px]"><Euro :v="tot.entrate" /></div>
          </article>
          <article class="blocco reveal col-span-6 flex min-h-[148px] flex-col justify-between gap-6 bg-arancio sm:min-h-[176px] min-[981px]:col-span-3" style="--i: 2">
            <div class="flex flex-wrap items-start justify-between gap-2"><span class="text-[15px] font-medium">Uscite</span><span class="chip whitespace-nowrap">{{ variazione(tot.uscite, prima.uscite, mesePrima) }}</span></div>
            <div class="text-[clamp(20px,7vw,28px)] leading-none whitespace-nowrap sm:text-[40px]"><Euro :v="tot.uscite" /></div>
          </article>
          <!-- Condiviso: la cassa comune al posto del tasso di risparmio -->
          <article v-if="condiviso" class="blocco reveal col-span-12 flex flex-col justify-between gap-5 bg-ardesia text-su-inchiostro min-[981px]:col-span-6" style="--i: 3">
            <div class="flex items-start justify-between gap-4"><span class="text-[15px] font-medium">Cassa comune</span><i class="ph-bold ph-vault text-[22px]" /></div>
            <div class="flex flex-wrap items-end justify-between gap-4">
              <div class="text-[44px] leading-none tracking-[-0.05em] sm:text-[52px]"><Euro :v="cassa" /></div>
              <div class="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13.5px]">
                <span class="inline-flex items-center gap-1.5"><Avatar :p="walletStore.io" :size="22" />+{{ eur(inCassaMese(io), { corto: true }) }}</span>
                <span class="inline-flex items-center gap-1.5"><Avatar :p="partner" :size="22" />+{{ eur(inCassaMese(io === "creatore" ? "membro" : "creatore"), { corto: true }) }}</span>
                <span class="inline-flex items-center gap-1.5"><Avatar p="cassa" :size="22" />{{ spesoCassaMese ? "−" : "" }}{{ eur(spesoCassaMese, { corto: true }) }} a {{ nome.toLowerCase() }}</span>
              </div>
            </div>
          </article>
          <article v-else class="blocco reveal col-span-12 flex flex-col-reverse gap-5 bg-ardesia text-su-inchiostro sm:flex-row sm:items-end min-[981px]:col-span-6" style="--i: 3">
            <div class="flex flex-1 flex-col justify-between gap-5 self-stretch">
              <span class="text-[15px] font-medium">Tasso di risparmio</span>
              <div>
                <div class="bar bg-su-inchiostro/15!"><span class="bg-su-inchiostro!" :style="{ width: `${Math.max(0, Math.min(100, tasso))}%` }" /></div>
                <small class="mt-2.5 block text-[13.5px] opacity-85">Quota delle entrate che resta a fine mese</small>
              </div>
            </div>
            <div class="num text-[52px] leading-none tracking-[-0.05em] sm:ml-8 sm:text-[64px]">{{ tasso }}%</div>
          </article>
        </section>

        <!-- Scorciatoie -->
        <section class="mb-12 grid gap-2 sm:mb-16 sm:grid-cols-2 sm:gap-3" aria-label="Registra un movimento">
          <router-link
            v-for="a in [{ t: 'entrata', l: 'Aggiungi entrata', i: 'ph-plus', c: 'bg-salvia' }, { t: 'uscita', l: 'Aggiungi uscita', i: 'ph-minus', c: 'bg-arancio' }]"
            :key="a.t"
            :to="`/transazioni?tipo=${a.t}`"
            class="group reveal flex h-[68px] items-center gap-4 rounded-full bg-card pr-6 pl-3 transition hover:bg-campo active:scale-[.985] sm:h-[76px]"
          >
            <span class="grid h-[46px] w-[46px] flex-none place-items-center rounded-full text-[22px] text-inchiostro sm:h-[52px] sm:w-[52px]" :class="a.c"><i class="ph-bold" :class="a.i" /></span>
            <b class="flex-1 text-[17px] font-semibold tracking-[-0.015em]">{{ a.l }}</b>
            <i class="ph-bold ph-arrow-right text-lg text-testo3 transition group-hover:translate-x-[3px] group-hover:text-testo" />
          </router-link>
        </section>

        <div class="mb-12 grid grid-cols-[minmax(0,1fr)] gap-3 sm:mb-16 min-[981px]:grid-cols-[7fr_5fr]">
          <section class="panel reveal" aria-labelledby="t-grafico">
            <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
              <h2 id="t-grafico" class="panel-title">Entrate e uscite</h2>
              <div class="seg" role="group" aria-label="Vista del grafico">
                <button :aria-pressed="vista === 'totale'" @click="vista = 'totale'">Totale</button>
                <button :aria-pressed="vista === 'entrate'" @click="vista = 'entrate'">Entrate</button>
                <button :aria-pressed="vista === 'uscite'" @click="vista = 'uscite'">Uscite</button>
              </div>
            </div>
            <Ciambella :fette="grafico.fette" :centro="grafico.centro" />
          </section>

          <section class="panel reveal" aria-labelledby="t-mov">
            <h2 id="t-mov" class="panel-title mb-6">Movimenti del mese</h2>
            <div v-if="tot.entrate || tot.uscite" class="mb-4">
              <div class="flex h-2 overflow-hidden rounded-full bg-bordo" role="img" :aria-label="`Uscite ${eur(tot.uscite)}, entrate ${eur(tot.entrate)}`">
                <span class="bg-arancio" :style="{ width: `${(tot.uscite / (tot.uscite + tot.entrate)) * 100}%` }" />
                <span class="bg-salvia" :style="{ width: `${(tot.entrate / (tot.uscite + tot.entrate)) * 100}%` }" />
              </div>
              <div class="mt-2 flex justify-between text-[13px] text-testo2"><span>Uscite <Euro :v="tot.uscite" /></span><span>Entrate <Euro :v="tot.entrate" /></span></div>
            </div>
            <p v-if="!ultimi.length" class="vuoto">Ancora nessun movimento.<br />Inizia da “Aggiungi uscita”.</p>
            <router-link
              v-for="(m, i) in ultimi"
              :key="m.documentId"
              :to="`/transazioni/${m.documentId}`"
              class="flex items-center gap-3 py-3"
              :class="{ 'border-t border-bordo': i }"
            >
              <span class="relative grid h-11 w-11 flex-none place-items-center rounded-full bg-campo text-[22px]">
                <Emoji :e="m.cat.icona || '🏷️'" />
                <Avatar v-if="condiviso && m.pagatoDa" :p="walletStore.personaDi(wallet, m.pagatoDa)" :size="22" class="absolute -right-1 -bottom-1 ring-2 ring-card" />
              </span>
              <span class="min-w-0 flex-1">
                <b class="block truncate text-[15px] font-medium">{{ m.Descrizione || m.cat.Nome }}</b>
                <small class="block truncate text-[13px] text-testo2">
                  {{ breve(m.Data) }} ·
                  <template v-if="m.tipo === 'rimborso'">{{ m.pagatoDa === io ? `hai dato a ${partner?.nome}` : `${partner?.nome} ti ha dato` }}</template>
                  <template v-else-if="m.tipo === 'versamento'">{{ m.pagatoDa === io ? "versato da te" : `versato da ${partner?.nome}` }}</template>
                  <template v-else-if="condiviso && m.pagatoDa">{{ chiPaga(m) }} · {{ divisione(m) }}</template>
                  <template v-else>{{ m.cat.Nome }}</template>
                </small>
              </span>
              <span class="num text-[15px] font-medium whitespace-nowrap" :class="m.tipo === 'entrata' ? 'text-fg-positivo' : m.tipo === 'uscita' ? 'text-fg-negativo' : 'text-testo2'">
                {{ m.tipo === "entrata" || m.tipo === "uscita" ? eur(m.tipo === "entrata" ? m.importo : -m.importo, { segno: true }) : eur(m.importo) }}
              </span>
            </router-link>
            <router-link to="/transazioni" class="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-testo2 hover:text-testo">
              Vedi tutte le transazioni <i class="ph-bold ph-arrow-right" />
            </router-link>
          </section>
        </div>

        <!-- Budget per categoria -->
        <section class="panel reveal" aria-labelledby="t-budget">
          <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h2 id="t-budget" class="panel-title">Budget per categoria</h2>
            <p v-if="budget.voci.length" class="text-sm text-testo2">
              Spesi <b class="num font-medium text-testo">{{ eur(budget.speso, { corto: true }) }}</b> su
              <b class="num font-medium text-testo">{{ eur(budget.budget, { corto: true }) }}</b> ·
              {{ budget.rimanente >= 0 ? "rimangono" : "oltre di" }}
              <b class="num font-medium" :class="budget.rimanente >= 0 ? 'text-testo' : 'text-fg-avviso'">{{ eur(Math.abs(budget.rimanente), { corto: true }) }}</b>
            </p>
          </div>
          <div v-if="dashboard.proiezionePreoccupante" class="mb-4 flex items-start gap-3 rounded-[14px] bg-fondo px-5 py-4 text-[13.5px]">
            <i class="ph-bold ph-trend-up mt-px text-lg text-fg-avviso" />
            <span>
              <b class="font-medium">Di questo passo sfori:</b> chiuderesti il mese a {{ eur(dashboard.proiezione, { corto: true }) }},
              {{ eur(dashboard.proiezione - dashboard.totaleBudget, { corto: true }) }} sopra il budget.
            </span>
          </div>
          <p v-if="!budget.voci.length" class="vuoto">
            Nessuna categoria di spesa con un budget.
            <router-link to="/impostazioni#categorie" class="underline underline-offset-4">Impostalo nelle Categorie</router-link>.
          </p>
          <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
            <article
              v-for="v in budget.voci"
              :id="`categoria-${v.id}`"
              :key="v.id"
              class="flex flex-col gap-5 rounded-[20px] p-5"
              :class="[v.stato === 'sforato' ? 'bg-arancio text-inchiostro' : 'bg-campo', { 'ring-2 ring-anello': evidenzia === v.id }]"
            >
              <div class="flex items-center gap-3">
                <span class="grid h-10 w-10 flex-none place-items-center rounded-full text-xl" :class="v.stato === 'sforato' ? 'bg-inchiostro-velo' : 'bg-card'"><Emoji :e="v.icona || '🏷️'" /></span>
                <b class="min-w-0 flex-1 truncate text-[15px] font-medium">{{ v.nome }}</b>
                <span v-if="v.stato === 'sforato'" class="chip">sforato</span>
              </div>
              <!-- cifra e "rimasti di" affiancati sulla stessa linea di base (progetto.md §16) -->
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <strong class="num text-[28px] leading-none font-normal">{{ eur(v.rimanente, { corto: true }) }}</strong>
                <small class="text-[13px]" :class="v.stato === 'sforato' ? '' : 'text-testo2'">{{ v.rimanente < 0 ? "oltre" : "rimasti di" }} {{ eur(v.budget, { corto: true }) }}</small>
              </div>
              <div class="bar h-1.5!" :class="{ 'bg-inchiostro-velo!': v.stato === 'sforato' }" role="img" :aria-label="`Speso ${eur(v.speso)} su ${eur(v.budget)}`">
                <span :class="{ 'bg-arancio!': v.stato === 'vicino', 'bg-salvia!': v.stato === 'ok', 'bg-inchiostro!': v.stato === 'sforato' }" :style="{ width: `${v.percentuale}%` }" />
              </div>
              <p v-if="v.stato === 'sforato'" class="-mt-2 text-[13px] font-semibold">Sforato di {{ eur(-v.rimanente, { corto: true }) }}</p>
            </article>
          </div>
        </section>

        <!-- Chiusura della Home: accesso al Salvadanaio (progetto.md §15) -->
        <router-link
          v-if="salvadanaio"
          to="/risparmio"
          class="blocco group reveal mt-10 grid grid-cols-[minmax(0,1fr)] gap-8 bg-crema transition hover:bg-crema-scuro active:scale-[.995] sm:mt-12 sm:p-8 min-[981px]:grid-cols-2 min-[981px]:gap-10"
          aria-label="Apri il salvadanaio"
        >
          <div class="flex flex-col">
            <div class="flex items-center gap-3 text-base font-semibold">
              <span class="grid h-12 w-12 place-items-center rounded-full bg-inchiostro text-[22px] text-su-inchiostro"><i class="ph-bold ph-piggy-bank" /></span>Salvadanaio
            </div>
            <div class="mt-auto pt-6 text-[clamp(48px,6vw,76px)] leading-none tracking-[-0.055em] min-[981px]:pt-10"><Euro :v="totaleSalvadanaio" /></div>
            <p class="mt-3 text-[14.5px] font-medium">messi da parte in {{ cartelle.length }} {{ cartelle.length === 1 ? "cartella" : "cartelle" }}</p>
          </div>
          <div class="flex flex-col gap-5">
            <ul class="flex flex-col">
              <li
                v-for="(c, i) in piuRicchi"
                :key="c.id"
                class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3"
                :class="{ 'border-t-[1.5px] border-inchiostro-velo': i }"
              >
                <span class="grid h-9 w-9 place-items-center rounded-full text-xl" :style="{ background: c.standard ? 'var(--color-inchiostro-velo)' : `var(--color-av-${c.colore})` }">
                  <i v-if="c.standard" class="ph-bold ph-calendar-blank text-[17px]" /><Emoji v-else :e="c.emoji || '🐷'" />
                </span>
                <span class="min-w-0">
                  <b class="block truncate text-[14.5px] font-semibold">{{ c.nome }}</b>
                  <span v-if="c.obiettivo" class="bar mt-1.5 block h-[5px]! bg-inchiostro-velo!"><span class="bg-inchiostro!" :style="{ width: `${Math.min(100, (c.saldo / c.obiettivo) * 100)}%` }" /></span>
                  <small v-else class="mt-1 block text-[12.5px] font-medium">{{ c.standard ? "un mese per riga" : "senza obiettivo" }}</small>
                </span>
                <span class="num text-base tracking-[-0.02em]">{{ eur(c.saldo, { corto: true }) }}</span>
              </li>
            </ul>
            <span class="pill-btn pill-btn--ink mt-auto h-[52px]! self-stretch sm:self-end">
              Apri il salvadanaio <i class="ph-bold ph-arrow-right transition-transform group-hover:translate-x-[3px]" />
            </span>
          </div>
        </router-link>
      </template>
    </template>
    <Dialog v-model:visible="salda.aperto" modal :showHeader="false" :pt="{ root: { class: 'w-[min(440px,calc(100%-32px))] rounded-[28px]! border-0! bg-card!' }, content: { class: 'p-6! sm:p-8!' } }">
      <span class="flex items-center gap-3">
        <Avatar :p="walletStore.personaDi(wallet, daChi)" :size="40" /><i class="ph-bold ph-arrow-right text-testo3" /><Avatar :p="walletStore.personaDi(wallet, altro(daChi))" :size="40" />
      </span>
      <h2 class="mt-5 text-[26px] leading-tight font-medium tracking-[-0.035em]">{{ daChi === io ? `Dai i soldi a ${partner?.nome}` : `${partner?.nome} ti dà i soldi` }}</h2>
      <p class="mt-3 text-[14.5px] text-testo2">Registra un rimborso. Puoi cambiare l'importo per un saldo parziale.</p>
      <div class="mt-6 flex items-baseline gap-1.5 border-b-2 border-bordo-forte pb-1.5 focus-within:border-testo">
        <span class="text-[26px] text-testo2">€</span>
        <input v-model="salda.importo" inputmode="decimal" aria-label="Importo del rimborso" class="num w-full min-w-0 flex-1 bg-transparent text-[44px] tracking-[-0.045em] outline-none" />
      </div>
      <div class="mt-8 flex justify-end gap-2">
        <button class="pill-btn pill-btn--ghost h-12!" @click="salda.aperto = false">Annulla</button>
        <button class="pill-btn pill-btn--cream h-12!" :disabled="salda.salvando" @click="registraRimborso">Registra rimborso</button>
      </div>
    </Dialog>
  </div>
</template>

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
    const creato = await creaWallet(primo.nome.trim(), primo.budget ?? 0);
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

const nome = computed(() => nomeMese(dashboard.mese.mese));
const movimenti = computed(() => appiattisci(dashboard.categorie));
const tot = computed(() => totali(movimenti.value));
const prima = computed(() => totali(appiattisci(dashboard.precedente)));
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
      centro: { etichetta: "Saldo", valore: t.saldo, sotto: t.entrate ? `speso il ${spesoPct.value}%` : "" },
    };
  }
  const tipo = vista.value === "entrate" ? "entrata" : "uscita";
  const f = fette(dashboard.categorie, tipo);
  return {
    fette: f,
    centro: {
      etichetta: tipo === "entrata" ? "Entrate" : "Uscite",
      valore: tipo === "entrata" ? t.entrate : t.uscite,
      sotto: `${f.length} ${f.length === 1 ? "categoria" : "categorie"}`,
    },
  };
});

const ultimi = computed(() => movimenti.value.filter((m) => m.tipo === "entrata" || m.tipo === "uscita").slice(0, 6));
const budget = computed(() => budgetCategorie(dashboard.categorie));
const breve = (d) => `${Number(d.slice(8, 10))} ${nome.value.slice(0, 3).toLowerCase()}`;
</script>

<template>
  <div>
    <!-- Primo avvio -->
    <section v-if="walletStore.caricati && !walletStore.wallets.length" class="blocco reveal mx-auto max-w-xl bg-crema">
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
          <InputNumber v-model="primo.budget" inputId="primo-budget" mode="currency" currency="EUR" locale="it-IT" :min="0" fluid />
        </div>
        <button type="submit" class="pill-btn pill-btn--ink mt-2" :disabled="primo.salvando || !primo.nome.trim()">Crea il portafoglio</button>
      </form>
    </section>

    <template v-else>
      <div class="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
        <div>
          <div class="eyebrow">Riepilogo del mese</div>
          <h1 class="display">{{ nome }} <span class="text-testo3">{{ dashboard.mese.anno }}</span></h1>
        </div>
        <div class="ml-auto flex flex-wrap justify-end gap-2">
          <router-link to="/consigli" class="circle-btn relative" aria-label="Consigli sul budget" title="Consigli sul budget">
            <i class="ph-bold ph-bell" />
            <span v-if="consigli.nonLetti" class="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-arancio px-1 text-[11px] font-bold text-inchiostro">{{ consigli.nonLetti }}</span>
          </router-link>
          <router-link to="/anno" class="circle-btn" aria-label="Riepilogo dell'anno" title="Riepilogo dell'anno"><i class="ph-bold ph-chart-bar" /></router-link>
          <button class="circle-btn" aria-label="Mese precedente" @click="dashboard.cambiaMese(-1)"><i class="ph-bold ph-caret-left" /></button>
          <button class="circle-btn" aria-label="Mese successivo" @click="dashboard.cambiaMese(1)"><i class="ph-bold ph-caret-right" /></button>
        </div>
      </div>

      <div v-if="dashboard.errore" class="box-errore mb-3">{{ dashboard.errore }}</div>
      <Skeleton v-else-if="!walletStore.selectedWallet || (dashboard.loading && !dashboard.categorie.length)" height="22rem" borderRadius="28px" class="mb-3" />

      <template v-else>
        <!-- Numeri del mese -->
        <section class="mb-3 grid grid-cols-12 gap-2 sm:gap-3" :class="{ 'opacity-60': dashboard.loading }" aria-label="Numeri del mese">
          <article class="blocco reveal col-span-12 flex min-h-[148px] flex-col justify-between gap-6 bg-crema sm:p-8 min-[981px]:col-span-6 min-[981px]:row-span-2">
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
          <article class="blocco reveal col-span-12 flex flex-col-reverse gap-5 bg-ardesia text-su-inchiostro sm:flex-row sm:items-end min-[981px]:col-span-6" style="--i: 3">
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
              <span class="grid h-11 w-11 flex-none place-items-center rounded-full bg-campo text-[22px]"><Emoji :e="m.cat.icona || '🏷️'" /></span>
              <span class="min-w-0 flex-1">
                <b class="block truncate text-[15px] font-medium">{{ m.Descrizione || m.cat.Nome }}</b>
                <small class="block truncate text-[13px] text-testo2">{{ breve(m.Data) }} · {{ m.cat.Nome }}</small>
              </span>
              <span class="num text-[15px] font-medium whitespace-nowrap" :class="m.tipo === 'entrata' ? 'text-fg-positivo' : 'text-fg-negativo'">
                {{ eur(m.tipo === "entrata" ? m.importo : -m.importo, { segno: true }) }}
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
              <div class="flex items-baseline justify-between gap-2">
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
      </template>
    </template>
  </div>
</template>

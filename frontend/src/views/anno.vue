<script setup>
import { computed, ref, watch } from "vue";
import { useWalletStore } from "@/stores/wallet.js";
import { caricaAnno } from "@/services/anno.js";
import { erroreLeggibile } from "@/services/api.js";
import { nomeMese } from "@/utils/budget.js";
import { eur } from "@/utils/formato.js";
import { fatti, mesiAnno, miePerMese } from "@/utils/anno.js";
import { miaQuota } from "@/utils/conti.js";

// Riepilogo dell'anno (progetto.md §19).
const walletStore = useWalletStore();
const corto = (v) => eur(v, { corto: true });
const segno = (v) => (v >= 0 ? "+" : "−") + corto(Math.abs(Math.round(v)));
const adesso = new Date();
const annoCorrente = adesso.getFullYear();

const anno = ref(annoCorrente);
const esito = ref(null);
const loading = ref(false);
const errore = ref(null);
const vista = ref("grafico");

let ultima = 0;
async function carica() {
  const n = ++ultima;
  errore.value = null;
  if (!walletStore.walletId) return (esito.value = null);
  loading.value = true;
  try {
    const r = await caricaAnno(walletStore.walletId, anno.value);
    if (n === ultima) esito.value = r;
  } catch (e) {
    if (n === ultima) errore.value = erroreLeggibile(e);
  } finally {
    if (n === ultima) loading.value = false;
  }
}
watch(() => walletStore.walletId, carica, { immediate: true });
function cambiaAnno(passo) {
  if (anno.value + passo > annoCorrente) return; // non oltre l'anno corrente
  anno.value += passo;
  carica();
}

// Condiviso: niente stipendi, quindi niente saldo; speso insieme e la mia parte
const w = computed(() => walletStore.selectedWallet);
const condiviso = computed(() => !!w.value?.condiviso);
const partner = computed(() => walletStore.partnerDi(w.value));
const io = computed(() => walletStore.mioRuolo(w.value));
const riepilogo = computed(() => esito.value?.riepilogo);
const mesi = computed(() => {
  if (!riepilogo.value) return [];
  const mie = condiviso.value
    ? miePerMese(esito.value.righe, anno.value, (r) => miaQuota(r.quota, io.value, Number(w.value?.quotaCreatore ?? 0.5)))
    : null;
  return mesiAnno(riepilogo.value, anno.value, adesso, mie);
});
const f = computed(() => fatti(mesi.value));
const totMia = computed(() => mesi.value.reduce((s, m) => s + (m.mia || 0), 0));
const tasso = computed(() => (riepilogo.value?.entrate ? Math.max(0, Math.round(((riepilogo.value.entrate - riepilogo.value.speso) / riepilogo.value.entrate) * 100)) : 0));
const cima = computed(() => Math.max(1, ...mesi.value.map((m) => (condiviso.value ? m.uscite : Math.max(m.entrate, m.uscite)))) * 1.05);
const h = (v) => `${(Math.max(0, v) / cima.value) * 100}%`;
const periodo = computed(() => {
  if (!f.value) return "";
  const a = nomeMese(f.value.primo.i + 1).toLowerCase();
  const b = nomeMese(f.value.ultimo.i + 1).toLowerCase();
  return `Da ${a} a ${b}${f.value.ultimo.aperto ? `, con ${b} ancora in corso` : ""}`;
});
const suggerimento = (m) =>
  m.futuro
    ? `${nomeMese(m.i + 1)}: deve ancora arrivare`
    : !m.dati
      ? `${nomeMese(m.i + 1)}: nessun movimento`
      : condiviso.value
        ? `${nomeMese(m.i + 1)}${m.aperto ? " · in corso" : ""}: speso ${eur(m.uscite)}, la tua parte ${eur(m.mia)}`
        : `${nomeMese(m.i + 1)}${m.aperto ? " · in corso" : ""}: entrate ${eur(m.entrate)}, uscite ${eur(m.uscite)}, saldo ${segno(m.saldo)}`;
</script>

<template>
  <div>
    <div class="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
      <div>
        <router-link to="/" class="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-testo2 hover:text-testo"><i class="ph-bold ph-arrow-left" />Home</router-link>
        <h1 class="display">Anno <span class="text-testo3">{{ anno }}</span></h1>
      </div>
      <div class="flex gap-2">
        <button class="circle-btn" aria-label="Anno precedente" @click="cambiaAnno(-1)"><i class="ph-bold ph-caret-left" /></button>
        <button class="circle-btn disabled:opacity-40" aria-label="Anno successivo" :disabled="anno >= annoCorrente" @click="cambiaAnno(1)"><i class="ph-bold ph-caret-right" /></button>
      </div>
    </div>

    <div v-if="errore" class="box-errore">{{ errore }}</div>
    <Skeleton v-else-if="loading && !esito" height="22rem" borderRadius="28px" />
    <section v-else-if="!f" class="panel flex flex-col items-center gap-3 py-14 text-center">
      <span class="grid h-14 w-14 place-items-center rounded-full bg-campo text-2xl text-testo2"><i class="ph-bold ph-calendar-x" /></span>
      <h2 class="text-[26px] font-medium tracking-[-0.035em]">Nessun movimento nel {{ anno }}</h2>
      <p class="text-testo2">Qui compaiono gli anni in cui hai registrato almeno un movimento.</p>
    </section>

    <template v-else>
      <!-- Dati parziali: il totale sarebbe più basso del vero, va detto -->
      <div v-if="esito.mancanti > 0" class="box-errore mb-3 flex gap-3">
        <i class="ph-bold ph-warning mt-0.5" />Mancano {{ esito.mancanti }} transazioni: i totali sono più bassi di quelli reali.
      </div>

      <!-- Numeri dell'anno, con la grammatica della Home -->
      <section class="mb-3 grid grid-cols-12 gap-2 sm:gap-3" aria-label="Numeri dell'anno">
        <article class="blocco reveal col-span-12 flex min-h-[148px] flex-col justify-between gap-5 bg-crema sm:p-8 min-[981px]:col-span-6 min-[981px]:row-span-2">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <span class="text-[15px] font-medium">{{ condiviso ? "Speso insieme" : "Saldo dell'anno" }}</span>
            <span class="chip">{{ f.quanti }} {{ f.quanti === 1 ? "mese" : "mesi" }}</span>
          </div>
          <div class="text-[clamp(52px,7.4vw,92px)] leading-none tracking-[-0.055em]"><Euro :v="condiviso ? riepilogo.speso : riepilogo.entrate - riepilogo.speso" /></div>
          <small class="text-[13.5px] font-medium">{{ periodo }}</small>
        </article>
        <article class="blocco reveal col-span-6 flex min-h-[140px] flex-col justify-between gap-6 bg-salvia min-[981px]:col-span-3" style="--i: 1">
          <span class="text-[15px] font-medium">{{ condiviso ? "La tua parte" : "Entrate" }}</span>
          <div class="text-[clamp(20px,7vw,28px)] leading-none whitespace-nowrap sm:text-[40px]"><Euro :v="condiviso ? totMia : riepilogo.entrate" /></div>
        </article>
        <article class="blocco reveal col-span-6 flex min-h-[140px] flex-col justify-between gap-6 bg-arancio min-[981px]:col-span-3" style="--i: 2">
          <span class="truncate text-[15px] font-medium">{{ condiviso ? `Parte di ${partner?.nome}` : "Uscite" }}</span>
          <div class="text-[clamp(20px,7vw,28px)] leading-none whitespace-nowrap sm:text-[40px]"><Euro :v="condiviso ? riepilogo.speso - totMia : riepilogo.speso" /></div>
        </article>
        <article v-if="!condiviso" class="blocco reveal col-span-12 flex flex-col-reverse gap-5 bg-ardesia text-su-inchiostro sm:flex-row sm:items-end min-[981px]:col-span-6" style="--i: 3">
          <div class="flex flex-1 flex-col justify-between gap-5 self-stretch">
            <span class="text-[15px] font-medium">Tasso di risparmio</span>
            <div>
              <div class="bar bg-su-inchiostro/15!"><span class="bg-su-inchiostro!" :style="{ width: `${tasso}%` }" /></div>
              <small class="mt-2.5 block text-[13.5px] opacity-85">Quota delle entrate dell'anno che è rimasta</small>
            </div>
          </div>
          <div class="num text-[52px] leading-none tracking-[-0.05em] sm:ml-8 sm:text-[64px]">{{ tasso }}%</div>
        </article>
      </section>

      <!-- Tre fatti -->
      <section class="mb-12 grid gap-2 sm:mb-16 sm:gap-3 min-[981px]:grid-cols-3" aria-label="L'anno in breve">
        <div
          v-for="x in condiviso
            ? [
                { i: 'ph-feather', l: 'Mese più leggero', v: `${nomeMese(f.leggero.i + 1)} · ${corto(Math.round(f.leggero.uscite))}` },
                { i: 'ph-receipt', l: 'Mese più caro', v: `${nomeMese(f.caro.i + 1)} · ${corto(Math.round(f.caro.uscite))}` },
                { i: 'ph-equals', l: 'Spese medie al mese', v: corto(Math.round(f.media)) },
              ]
            : [
                { i: 'ph-trophy', l: 'Mese migliore', v: `${nomeMese(f.migliore.i + 1)} · ${segno(f.migliore.saldo)}` },
                { i: 'ph-receipt', l: 'Mese più caro', v: `${nomeMese(f.caro.i + 1)} · ${corto(Math.round(f.caro.uscite))}` },
                { i: 'ph-equals', l: 'Uscite medie al mese', v: corto(Math.round(f.media)) },
              ]"
          :key="x.l"
          class="reveal flex items-center gap-4 rounded-[20px] bg-card px-6 py-5"
        >
          <span class="grid h-11 w-11 flex-none place-items-center rounded-full bg-campo text-xl text-fg-accento"><i class="ph-bold" :class="x.i" /></span>
          <span class="min-w-0"><small class="block text-[13px] text-testo2">{{ x.l }}</small><b class="num text-[17px] font-medium tracking-[-0.015em]">{{ x.v }}</b></span>
        </div>
      </section>

      <!-- Mese per mese -->
      <section class="panel reveal mb-3" aria-labelledby="t-mesi">
        <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h2 id="t-mesi" class="panel-title">Mese per mese</h2>
          <div class="seg" role="group" aria-label="Vista">
            <button :aria-pressed="vista === 'grafico'" @click="vista = 'grafico'">Grafico</button>
            <button :aria-pressed="vista === 'tabella'" @click="vista = 'tabella'">Tabella</button>
          </div>
        </div>

        <template v-if="vista === 'grafico'">
          <!-- A specchio: entrate sopra la linea, uscite sotto. La posizione dice cosa è,
               il colore aiuta soltanto (salvia e arancio vicini non reggono il daltonismo). -->
          <div class="mb-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-testo2">
            <template v-if="condiviso"><span class="inline-flex items-center gap-2"><i class="h-2.5 w-2.5 rounded-[3px] bg-arancio" />Spese di casa</span></template>
            <template v-else>
              <span class="inline-flex items-center gap-2"><i class="h-2.5 w-2.5 rounded-[3px] bg-salvia" /><i class="ph-bold ph-arrow-up" />Entrate, sopra la linea</span>
              <span class="inline-flex items-center gap-2"><i class="h-2.5 w-2.5 rounded-[3px] bg-arancio" /><i class="ph-bold ph-arrow-down" />Uscite, sotto la linea</span>
            </template>
            <span class="inline-flex items-center gap-2"><i class="h-2.5 w-2.5 rounded-[3px] shadow-[inset_0_0_0_2px_var(--color-testo2)]" />Mese in corso</span>
            <span class="max-[640px]:hidden">Sotto ogni mese: {{ condiviso ? "la tua parte" : "il saldo" }}</span>
          </div>
          <div class="relative grid h-[220px] grid-cols-12 gap-[3px] sm:h-[300px] sm:gap-2">
            <div class="pointer-events-none absolute inset-x-0 border-t border-bordo-forte" :class="condiviso ? 'bottom-0' : 'top-1/2'" />
            <div
              v-for="m in mesi"
              :key="m.i"
              class="group relative grid rounded-[10px] outline-offset-2"
              :class="condiviso ? 'grid-rows-1' : 'grid-rows-2'"
              tabindex="0"
              role="img"
              :aria-label="suggerimento(m)"
            >
              <span class="pointer-events-none absolute -top-2 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full rounded-[10px] bg-fondo-profondo px-3 py-2 text-[12.5px] whitespace-nowrap text-testo shadow-pop group-hover:block group-focus:block">{{ suggerimento(m) }}</span>
              <div v-if="!condiviso" class="flex items-end justify-center pb-0.5">
                <span
                  v-if="m.dati && !m.futuro"
                  class="block min-h-0.5 w-[62%] max-w-[34px] rounded-t-md rounded-b-sm"
                  :class="m.aperto ? 'shadow-[inset_0_0_0_2px_var(--color-salvia)]' : 'bg-salvia'"
                  :style="{ height: h(m.entrate) }"
                />
              </div>
              <div class="flex justify-center" :class="condiviso ? 'items-end pb-0.5' : 'items-start pt-0.5'">
                <span
                  v-if="m.dati && !m.futuro"
                  class="block min-h-0.5 w-[62%] max-w-[34px]"
                  :class="[m.aperto ? 'shadow-[inset_0_0_0_2px_var(--color-arancio)]' : 'bg-arancio', condiviso ? 'rounded-t-md rounded-b-sm' : 'rounded-t-sm rounded-b-md']"
                  :style="{ height: h(m.uscite) }"
                />
              </div>
            </div>
          </div>
          <div class="mt-3 grid grid-cols-12 gap-[3px] sm:gap-2" aria-hidden="true">
            <span v-for="m in mesi" :key="m.i" class="text-center text-[12.5px] text-testo2" :class="{ 'font-semibold text-testo': m.aperto }">
              {{ nomeMese(m.i + 1).slice(0, 3) }}
              <span class="num mt-0.5 block text-xs text-testo3 max-[640px]:hidden">{{ m.dati ? (condiviso ? corto(Math.round(m.mia)) : segno(m.saldo)) : "—" }}</span>
            </span>
          </div>
        </template>

        <table v-else class="w-full text-[14px]">
          <thead class="text-left text-[12.5px] text-testo2">
            <tr>
              <th class="pb-2 font-medium">Mese</th>
              <template v-if="condiviso"><th class="pb-2 text-right font-medium">Speso</th><th class="pb-2 text-right font-medium">La tua parte</th></template>
              <template v-else><th class="pb-2 text-right font-medium">Entrate</th><th class="pb-2 text-right font-medium">Uscite</th><th class="pb-2 text-right font-medium">Saldo</th></template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in mesi.filter((x) => x.dati)" :key="m.i" class="border-t border-bordo" :class="{ 'text-testo2': m.aperto }">
              <td class="py-2.5">{{ nomeMese(m.i + 1) }}<template v-if="m.aperto"> · in corso</template></td>
              <template v-if="condiviso"><td class="num text-right">{{ eur(m.uscite) }}</td><td class="num text-right">{{ eur(m.mia) }}</td></template>
              <template v-else>
                <td class="num text-right text-fg-positivo">{{ eur(m.entrate) }}</td>
                <td class="num text-right text-fg-negativo">{{ eur(m.uscite) }}</td>
                <td class="num text-right">{{ segno(m.saldo) }}</td>
              </template>
            </tr>
          </tbody>
          <tfoot class="font-medium">
            <tr class="border-t-2 border-bordo-forte">
              <td class="py-2.5">Totale</td>
              <template v-if="condiviso"><td class="num text-right">{{ eur(riepilogo.speso) }}</td><td class="num text-right">{{ eur(totMia) }}</td></template>
              <template v-else>
                <td class="num text-right">{{ eur(riepilogo.entrate) }}</td><td class="num text-right">{{ eur(riepilogo.speso) }}</td>
                <td class="num text-right">{{ segno(riepilogo.entrate - riepilogo.speso) }}</td>
              </template>
            </tr>
          </tfoot>
        </table>
      </section>

      <!-- Uscite per categoria -->
      <section class="panel reveal">
        <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h2 class="panel-title">Uscite per categoria</h2>
          <p v-if="riepilogo.budgetStimato > 0" class="text-sm text-testo2">
            <b class="num font-medium text-testo">{{ corto(Math.round(riepilogo.speso)) }}</b> su <b class="num font-medium text-testo">{{ corto(riepilogo.budgetStimato) }}</b>
            di budget stimato ({{ riepilogo.mesiConsiderati }} {{ riepilogo.mesiConsiderati === 1 ? "mese" : "mesi" }})
          </p>
        </div>
        <div v-for="(c, i) in riepilogo.categorie.filter((c) => c.speso > 0 || c.budgetStimato > 0)" :key="c.documentId" class="flex items-center gap-3 py-3" :class="{ 'border-t border-bordo': i }">
          <span class="grid h-10 w-10 flex-none place-items-center rounded-full bg-campo text-xl"><Emoji :e="c.icona || '🏷️'" /></span>
          <span class="min-w-0 flex-1">
            <span class="flex items-baseline justify-between gap-3">
              <b class="truncate text-[15px] font-medium">{{ c.nome }}</b>
              <span class="num text-[15px] font-medium whitespace-nowrap" :class="{ 'text-fg-avviso': c.oltreStima }">{{ corto(Math.round(c.speso)) }}</span>
            </span>
            <span v-if="c.budgetStimato > 0" class="mt-1.5 flex items-center gap-3">
              <span class="bar h-1.5! flex-1"><span :class="c.oltreStima ? 'bg-arancio!' : 'bg-testo3!'" :style="{ width: `${Math.min(c.percentuale, 1) * 100}%` }" /></span>
              <small class="num text-xs whitespace-nowrap text-testo2">{{ c.oltreStima ? `oltre di ${corto(Math.round(c.speso - c.budgetStimato))}` : `stima ${corto(c.budgetStimato)}` }}</small>
            </span>
          </span>
        </div>
        <p class="mt-5 text-[12.5px] text-testo2">
          Lo speso è esatto. Il budget dell'anno è una stima: il budget attuale di ogni categoria moltiplicato per i mesi, perché l'app non conserva lo storico dei budget.
        </p>
      </section>
    </template>
  </div>
</template>

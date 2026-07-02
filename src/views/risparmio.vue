<template>
  <!--titolo-->
  <div class="flex justify-between items-center px-5 md:px-12 lg:px-20 py-10">
    <div class="hidden md:flex">
      <PageTitle />
    </div>
  </div>
  <div class="px-6">
    <div class="flex flex-col lg:flex-row">
      <div class="basis-2/3">
        <Card>
          <template #title>Trend Mensile Risparmio</template>
          <template #content>
            <Chart
              type="bar"
              :data="chartData"
              :options="chartOptions"
              class="h-[30rem]"
            />
          </template>
        </Card>
      </div>
      <div class="w-full lg:basis-1/3 lg:pl-3 mt-3 lg:mt-0">
        <Card class="h-[17rem]">
          <template #title>Totale Risparmio Storico</template>
          <template #content>
            <div class="flex flex-col items-center gap-4 py-6">
              <i
                :class="[
                  'text-5xl',
                  percentualeSpesa >= 90
                    ? 'pi pi-exclamation-triangle text-red-500'
                    : 'pi pi-wallet text-green-500',
                ]"
              ></i>
              <span
                :class="[
                  'text-4xl font-bold',
                  percentualeSpesa >= 90 ? 'text-red-500' : 'text-green-500',
                ]"
              >
                {{ totaleRisparmio }} €
              </span>
              <span class="text-surface-500 text-sm">
                {{
                  selectedWallet ? selectedWallet.Nome : "Seleziona un wallet"
                }}
              </span>
            </div>
          </template>
        </Card>
        <Card class="h-[17rem] mt-3">
          <template #title>Dettaglio Mese Precedente</template>
          <template #content>
            <div class="flex flex-col gap-4">
              <div class="flex justify-between items-center pt-5">
                <span class="text-surface-600">Budget</span>
                <span class="font-semibold text-lg">
                  {{ ultimoMese ? ultimoMese.budgetAllocato : 0 }} €
                </span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-surface-600">Speso</span>
                <span class="font-semibold text-lg">
                  {{ ultimoMese ? ultimoMese.speso : 0 }} €
                </span>
              </div>
              <ProgressBar :value="percentualeSpesa" :showValue="true" />
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>
<script>
import { useWalletStore } from "@/stores/wallet.js";

export default {
  name: "Risparmio",
  data() {
    return {
      salvadanaio: [],
    };
  },
  mounted() {
    if (this.selectedWallet) {
      this.loadDati(this.selectedWallet.documentId);
    }
  },
  computed: {
    walletStore() {
      return useWalletStore();
    },
    selectedWallet() {
      return useWalletStore().selectedWallet;
    },
    chartData() {
      return {
        labels: this.salvadanaio.map((s) =>
          new Date(s.mese).toLocaleDateString("it-IT", { month: "short" }),
        ),
        datasets: [
          {
            type: "bar",
            label: "Risparmiato",
            backgroundColor: "#10B981",
            data: this.salvadanaio.map((s) => s.risparmiato || 0),
          },
        ],
      };
    },
    chartOptions() {
      return { responsive: true, maintainAspectRatio: false };
    },
    totaleRisparmio() {
      return this.salvadanaio.reduce((sum, s) => sum + (s.risparmiato || 0), 0);
    },
    ultimoMese() {
      return this.salvadanaio[this.salvadanaio.length - 1] || null;
    },
    percentualeSpesa() {
      if (!this.ultimoMese || !this.ultimoMese.budgetAllocato) return 0;
      return (this.ultimoMese.speso / this.ultimoMese.budgetAllocato) * 100;
    },
  },
  watch: {
    selectedWallet(nuovoWallet) {
      if (nuovoWallet) {
        this.loadDati(nuovoWallet.documentId);
      }
    },
  },
  methods: {
    async loadDati(walletId) {
      try {
        const response = await this.$http.get("/api/salvadanaios", {
          params: {
            filters: { wallet: { documentId: { $eq: walletId } } },
            sort: "mese:asc",
            pagination: { limit: 12 },
          },
        });
        this.salvadanaio = response.data.data;
      } catch (err) {
        console.error("Errore caricamento salvadanaio:", err);
      }
    },
  },
};
</script>

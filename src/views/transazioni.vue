<template>
  <!--titolo-->
  <div class="flex justify-between items-center px-5 md:px-12 lg:px-20 py-10">
    <div class="hidden md:flex">
      <PageTitle />
    </div>
  </div>
  <div class="px-5 md:px-12 lg:px-20">
    <div class="flex flex-col gap-6 max-w-lg">
      <div class="flex flex-col gap-2">
        <label for="nome">Nome</label>
        <InputText size="large" id="nome" v-model="nome" />
      </div>
      <div class="flex flex-col gap-2">
        <label for="categoria">Categoria</label>
        <Select
          v-model="categoriaSelezionata"
          :options="categories"
          optionLabel="Nome"
          placeholder="Seleziona Categoria"
          size="large"
        />
      </div>
      <div class="flex flex-col gap-2">
        <label for="currency">Importo</label>
        <InputNumber
          v-model="importo"
          inputId="currency"
          mode="currency"
          currency="EUR"
          locale="it-IT"
          size="large"
          fluid
        />
      </div>
      <div class="flex flex-col gap-2">
        <label for="data">Data</label>
        <DatePicker
          v-model="data"
          showIcon
          fluid
          iconDisplay="input"
          inputId="data"
        />
      </div>
      <div class="flex flex-col gap-2">
        <label for="ricorrente">Ricorrente</label>
        <ToggleSwitch v-model="ricorrente" />
      </div>
      <div v-if="ricorrente" class="flex flex-col gap-2">
        <label for="dataRicorrenza">Data Ricorrenza</label>
        <DatePicker v-model="dataRicorrenza" inline showWeek />
      </div>
      <div class="flex gap-4">
        <Button
          label="Annulla"
          severity="danger"
          raised
          @click="$router.push('/')"
        />
        <Button
          label="Salva"
          severity="success"
          raised
          @click="newTrans"
          :loading="saving"
          :disabled="saving"
        />
      </div>
    </div>
  </div>
</template>
<script>
import { useWalletStore } from "@/stores/wallet.js";

export default {
  name: "Transazioni",
  data() {
    return {
      categoriesTutte: [],
      categoriaSelezionata: null,
      nome: "",
      importo: null,
      data: new Date(),
      ricorrente: false,
      dataRicorrenza: null,
      saving: false,
    };
  },

  async mounted() {
    try {
      const response = await this.$http.get("/api/categories", {
        params: { populate: "*" },
      });
      this.categoriesTutte = response.data.data;
    } catch (err) {
      if (err.code !== "ERR_CANCELED") {
        console.error("Errore caricamento categorie:", err);
      }
    }
  },

  computed: {
    categories() {
      const wallet = useWalletStore().selectedWallet;
      if (!wallet) return this.categoriesTutte;
      return this.categoriesTutte.filter(c => c.wallet?.documentId === wallet.documentId);
    },
  },

  methods: {
    async newTrans() {
      this.saving = true;
      try {
        const dataStrapi = this.data.toISOString().split("T")[0];
        const dataRicorrenteStrapi = this.dataRicorrenza
          ? this.dataRicorrenza.toISOString().split("T")[0]
          : null;
        const response = await this.$http.post("/api/transazionis", {
          data: {
            categorie: this.categoriaSelezionata.documentId,
            Descrizione: this.nome,
            Importo: this.importo,
            Data: dataStrapi,
            TransazioneRicorrente: this.ricorrente || null,
            RicorrenzaTemporale: dataRicorrenteStrapi || null,
          },
        });
        this.$toast.add({
          severity: "success",
          summary: "Transazione salvata",
          detail: "Transazione salvata correttamente",
          life: 3000,
        });
        this.saving = false;
        this.$router.push("/");
      } catch (err) {
        console.error("Errore salvataggio transazione:", err);
        this.$toast.add({
          severity: "error",
          summary: "Error",
          detail: "Errore salvataggio transazione",
          life: 3000,
        });
        this.saving = false;
      }
    },
  },
};
</script>

<template>
  <div class="flex justify-between items-center px-5 md:px-12 lg:px-20 py-10">
    <div class="hidden md:flex">
      <PageTitle />
    </div>
  </div>
  <div class="card px-5">
    <Tabs :value="wallet.length > 0 ? wallet[0].documentId : '0'">
      <TabList>
        <Tab v-for="w in wallet" :key="w.documentId" :value="w.documentId">
          {{ w.Nome }}</Tab
        >
      </TabList>
      <TabPanels>
        <TabPanel v-for="w in wallet" :key="w.documentId" :value="w.documentId">
          <!--modifica wallet -->

          <div class="flex flex-row">
            <div class="basis-full mr-3">
              <label for="nome-wallet" class="font-bold block mb-2">
                Modifica Nome
              </label>
              <InputText
                type="text"
                v-model="w.Nome"
                fluid
                class="mb-5"
                @value-change="saveWalletDebounced(w)"
              />
            </div>
            <div class="basis-full ml-3">
              <label for="currency-italy" class="font-bold block mb-2">
                Modifica Badget
              </label>
              <InputNumber
                v-model="w.Budget"
                inputId="currency-italy"
                mode="currency"
                currency="EUR"
                locale="it-IT"
                fluid
                class="mb-5"
                @value-change="saveWalletDebounced(w)"
              />
            </div>
          </div>
          <!--tabella categorie -->

          <div class="card">
            <Toolbar class="mb-6">
              <template #start>
                <Button
                  label="Crea"
                  icon="pi pi-plus"
                  class="mr-2"
                  @click="openNewCategory(w)"
                />
              </template>

              <template #end>
                <Button
                  label="Cancella"
                  icon="pi pi-trash"
                  severity="danger"
                  variant="outlined"
                  @click="confirmDeleteSelected"
                  :disabled="!selectedProducts || !selectedProducts.length"
                />
              </template>
            </Toolbar>
            <DataTable
              v-model:editingRows="editingRows"
              v-model:selection="selectedProducts"
              :value="
                category.filter((c) => c.wallet?.documentId === w.documentId)
              "
              editMode="row"
              dataKey="id"
              @row-edit-save="onRowEditSave"
              :pt="{
                column: {
                  bodycell: ({ state }) => ({
                    style:
                      state['d_editing'] &&
                      'padding-top: 0.75rem; padding-bottom: 0.75rem',
                  }),
                },
              }"
            >
              <Column
                selectionMode="multiple"
                style="width: 3rem"
                :exportable="false"
              ></Column>
              <Column field="Nome" header="Nome" style="width: 50%">
                <template #editor="{ data, field }">
                  <InputText v-model="data[field]" fluid />
                </template>
              </Column>
              <Column
                field="Budget_categoria"
                header="Budget_categoria"
                style="width: 50%"
              >
                <template #editor="{ data, field }">
                  <InputText v-model="data[field]" fluid />
                </template>
              </Column>

              <Column
                :rowEditor="true"
                style="width: 10%; min-width: 8rem"
                bodyStyle="text-align:center"
              ></Column>
            </DataTable>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
    <div class="card flex justify-center">
      <Dialog
        v-model:visible="dialogCreateCategory"
        modal
        header="Crea Categoria"
        :style="{ width: '25rem' }"
      >
        <div class="flex flex-col md:flex-row">
          <div class="basis-full">
            <label for="Nome" class="font-bold block mb-2">
              Nome categoria
            </label>
            <InputText
              v-model="nuovaCategoriaNome"
              type="text"
              fluid
              class="mb-5"
            />
          </div>
        </div>
        <div class="flex flex-row">
          <div class="basis-full">
            <label for="Budget" class="font-bold block mb-2">
              Badget categoria
            </label>
            <InputNumber
              v-model="nuovaCategoriaBudget"
              inputId="currency-italy"
              mode="currency"
              currency="EUR"
              locale="it-IT"
              fluid
              class="mb-5"
            />
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <Button
            type="button"
            label="Annulla"
            severity="secondary"
            @click="visible = false"
          ></Button>
          <Button
            type="button"
            severity="success"
            label="Salva"
            @click="newCategory"
          ></Button>
        </div>
      </Dialog>
    </div>
  </div>
</template>
<script>
export default {
  name: "Impostazioni",
  data() {
    return {
      salvadanaio: [],
      wallet: [],
      category: [],
      editingRows: [],
      selectedProducts: [],
      debounceTimer: null,
      dialogCreateCategory: false,
      nuovaCategoriaNome: "",
      nuovaCategoriaBudget: null,
      nuovaCategoriaWalletId: null,
    };
  },
  async mounted() {
    await this.loadData();
  },
  methods: {
    async loadData() {
      const responseWallet = await this.$http.get("/api/wallets", {
        params: { populate: "*" },
      });
      const responseCategory = await this.$http.get("/api/categories", {
        params: { populate: "*" },
      });
      this.wallet = responseWallet.data.data;
      this.category = responseCategory.data.data;
    },
    async onRowEditSave(event) {
      let { newData } = event;
      await this.$http.put(`/api/categories/${newData.documentId}`, {
        data: {
          Nome: newData.Nome,
          Budget_categoria: newData.Budget_categoria,
        },
      });
      // Aggiorna l'array locale
      const idx = this.category.findIndex(
        (c) => c.documentId === newData.documentId,
      );
      if (idx !== -1) this.category[idx] = newData;
    },
    saveWalletDebounced(w) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.saveWallet(w);
      }, 800); // aspetta 800ms dopo l'ultimo input
    },
    async saveWallet(w) {
      try {
        await this.$http.put(`/api/wallets/${w.documentId}`, {
          data: {
            Nome: w.Nome,
            Budget: w.Budget,
          },
        });
        this.$toast.add({
          severity: "success",
          summary: "Salvato",
          detail: `Wallet "${w.Nome}" aggiornato`,
          life: 2000,
        });
      } catch (err) {
        console.error("Errore salvataggio wallet:", err);
        this.$toast.add({
          severity: "error",
          summary: "Errore",
          detail: "Salvataggio fallito",
          life: 3000,
        });
      }
    },
    openNewCategory(w) {
      this.nuovaCategoriaWalletId = w.documentId;
      this.dialogCreateCategory = true;
    },
    async newCategory() {
      try {
        const response = await this.$http.post("/api/categories", {
          data: {
            Nome: this.nuovaCategoriaNome,
            Budget_categoria: this.nuovaCategoriaBudget,
            wallet: this.nuovaCategoriaWalletId,
          },
        });
        // Aggiungi all'array locale con i dati restituiti da Strapi
        this.category.push(response.data.data);
        // Reset e chiudi dialog
        this.nuovaCategoriaNome = "";
        this.nuovaCategoriaBudget = null;
        this.dialogCreateCategory = false;
        this.$toast.add({
          severity: "success",
          summary: "Categoria creata",
          life: 2000,
        });
        await this.loadData();
      } catch (err) {
        console.error(err);
        this.$toast.add({
          severity: "error",
          summary: "Errore",
          detail: "Creazione fallita",
          life: 3000,
        });
      }
    },
    async confirmDeleteSelected() {
      await Promise.all(
        this.selectedProducts.map((c) =>
          this.$http.delete(`/api/categories/${c.documentId}`),
        ),
      );
      const deletedIds = this.selectedProducts.map((c) => c.documentId);
      this.category = this.category.filter(
        (c) => !deletedIds.includes(c.documentId),
      );
      this.selectedProducts = [];
      this.$toast.add({
        severity: "success",
        summary: "Eliminato",
        detail: "Categorie eliminate",
        life: 2000,
      });
    },
  },
};
</script>

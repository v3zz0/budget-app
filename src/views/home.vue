<template>
  <!--titolo-->
  <div class="flex justify-between items-center px-5 md:px-12 lg:px-20 py-10">
    <div class="hidden md:flex">
      <PageTitle />
    </div>
    <div>
      <Button
        icon="pi pi-download"
        label="Import csv"
        @click="importCSV($event)"
        severity="secondary"
        class="m-5"
      />
      <Button
        icon="pi pi-external-link"
        label="Export csv"
        @click="exportCSV($event)"
        severity="secondary"
      />
    </div>
  </div>
  <!--DATA-->
  <div
    class="bg-surface-50 dark:bg-surface-950 px-6 mb-5 md:px-12 lg:px-20 pt-6"
  >
    <div class="flex items-center justify-center gap-6">
      <Button
        icon="pi pi-chevron-left"
        text
        rounded
        severity="secondary"
        @click="mesePrecedente"
      />
      <div class="flex flex-col items-center min-w-48">
        <span
          class="text-xl font-bold capitalize text-surface-900 dark:text-surface-0"
        >
          {{ labelMese }}
        </span>
      </div>
      <Button
        icon="pi pi-chevron-right"
        text
        rounded
        severity="secondary"
        @click="meseSuccessivo"
      />
    </div>
  </div>
  <!--quadrati dashboard-->
  <div
    class="bg-surface-50 dark:bg-surface-950 pt-1 px-6 py-8 md:px-12 lg:px-20"
  >
    <div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
      <div
        class="bg-surface-0 dark:bg-surface-900 shadow-sm p-5 rounded-2xl"
        style="background: #f6f6f6"
      >
        <div class="flex justify-between gap-3">
          <div class="flex flex-col gap-2">
            <div
              class="text-surface-900 dark:text-surface-0 text-xl leading-tight!"
            >
              Budget
            </div>
          </div>
        </div>
        <div class="mt-4">
          <span
            class="text-surface-900 dark:text-surface-0 font-semibold text-2xl! leading-tight!"
            >{{ totaleBudget }} €</span
          >
        </div>
      </div>

      <div
        class="bg-surface-0 dark:bg-surface-900 shadow-sm p-5 rounded-2xl"
        style="background: #f6f6f6"
      >
        <div class="flex justify-between gap-3">
          <div class="flex flex-col gap-2">
            <div
              class="text-surface-900 dark:text-surface-0 text-xl leading-tight!"
            >
              Spesi
            </div>
          </div>
        </div>
        <div class="mt-4">
          <span
            class="text-surface-900 dark:text-surface-0 font-semibold text-2xl! leading-tight!"
            >{{ totaleSpesi }} €</span
          >
        </div>
      </div>
      <div
        class="bg-surface-0 dark:bg-surface-900 shadow-sm p-5 rounded-2xl"
        style="background: #f6f6f6"
      >
        <div class="flex justify-between gap-3">
          <div class="flex flex-col gap-2">
            <div
              class="text-surface-900 dark:text-surface-0 text-xl leading-tight!"
            >
              Rimanenti
            </div>
          </div>
        </div>
        <div class="mt-4">
          <span
            :class="[
              'font-semibold text-2xl! leading-tight!',
              totaleRimanenti < 0
                ? 'text-red-500'
                : 'text-surface-900 dark:text-surface-0',
            ]"
            >{{ totaleRimanenti }} €</span
          >
        </div>
      </div>
    </div>
  </div>
  <!-- Mostra le categorie del wallet selezionato -->
  <div class="card">
    <!-- Se sta caricando → mostra skeleton -->
    <DataTable v-if="loading" :value="new Array(5)">
      <Column style="width: 5%">
        <template #body><Skeleton width="2rem" /></template>
      </Column>
      <Column header="Nome">
        <template #body><Skeleton /></template>
      </Column>
      <Column header="Budget">
        <template #body><Skeleton width="4rem" /></template>
      </Column>
      <Column header="Spesi">
        <template #body><Skeleton width="4rem" /></template>
      </Column>
      <Column header="Rimanente">
        <template #body><Skeleton width="4rem" /></template>
      </Column>
    </DataTable>
    <DataTable
      v-else
      v-model:expandedRows="expandedRows"
      :value="categoriesFiltrate"
      dataKey="documentId"
    >
      <template #header> </template>
      <!-- Colonna con freccia espandi/chiudi -->
      <Column expander style="width: 5%" />
      <Column field="Nome" header="Nome" style="width: 20%"></Column>
      <Column field="Budget_categoria" header="Budget" style="width: 20%">
        <template #body="slotProps">
          {{ slotProps.data.Budget_categoria || 0 }} €
        </template>
      </Column>
      <Column field="Spesi" header="Spesi" style="width: 20%">
        <template #body="slotProps">
          {{
            slotProps.data.transazionis?.reduce(
              (s, tx) => s + (tx.Importo || 0),
              0,
            ) || 0
          }}
          €
        </template></Column
      >
      <Column field="Rimanenti" header="Rimanenti" style="width: 20%">
        <template #body="slotProps">
          <span
            :class="
              slotProps.data.Budget_categoria -
                (slotProps.data.transazionis?.reduce(
                  (s, tx) => s + (tx.Importo || 0),
                  0,
                ) || 0) <
              0
                ? 'text-red-500 font-bold'
                : ''
            "
          >
            {{
              slotProps.data.Budget_categoria -
              (slotProps.data.transazionis?.reduce(
                (s, tx) => s + (tx.Importo || 0),
                0,
              ) || 0)
            }}
            €
          </span>
        </template>
      </Column>

      <!-- Contenuto espanso: transazioni della categoria -->
      <template #expansion="slotProps">
        <div class="p-7" v-if="slotProps.data.transazionis.length > 0">
          <DataTable
            :value="slotProps.data.transazionis"
            v-model:editingRows="editingRowsTransazioni"
            editMode="row"
            dataKey="documentId"
            @row-edit-save="onTransazioneEditSave"
          >
            <Column field="Descrizione" header="Descrizione">
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" fluid />
              </template>
            </Column>
            <Column field="Importo" header="Importo">
              <template #body="txProps">{{ txProps.data.Importo }} €</template>
              <template #editor="{ data, field }">
                <InputNumber
                  v-model="data[field]"
                  mode="currency"
                  currency="EUR"
                  locale="it-IT"
                  fluid
                />
              </template>
            </Column>
            <Column field="Data" header="Data">
              <template #body="txProps">
                {{ new Date(txProps.data.Data).toLocaleDateString("it-IT") }}
              </template>
              <template #editor="{ data, field }">
                <DatePicker
                  :modelValue="data[field] ? new Date(data[field]) : null"
                  @update:modelValue="val => data[field] = val"
                  fluid
                />
              </template>
            </Column>
            <Column
              :rowEditor="true"
              style="width: 8rem"
              bodyStyle="text-align:center"
            />
            <Column>
              <template #body="{ data }">
                <Button
                  icon="pi pi-trash"
                  severity="danger"
                  rounded
                  @click="deleteRow(data)"
                />
              </template>
            </Column>
          </DataTable>
        </div>
        <div
          v-else
          class="text-surface-700 dark:text-surface-100 text-center flex flex-col items-center gap-4"
        >
          <h5 class="text-primary font-bold text-lg leading-tight">
            NESSUNA TRANSAZIONE DA MOSTRARE
          </h5>
        </div>
      </template>
    </DataTable>
  </div>
</template>
<script>
import { useWalletStore } from "@/stores/wallet.js";

export default {
  name: "Home",

  data() {
    return {
      categories: [],
      expandedRows: {},
      editingRowsTransazioni: [],
      loading: true,
      budget: null,
      meseCorrente: new Date().getMonth(),
      annoCorrente: new Date().getFullYear(),
    };
  },

  computed: {
    walletStore() {
      return useWalletStore();
    },
    selectedWallet() {
      return this.walletStore.selectedWallet;
    },
    totaleBudget() {
      return this.selectedWallet?.Budget || 0;
    },
    totaleSpesi() {
      return this.categoriesFiltrate.reduce((sum, cat) => {
        const speseCat =
          cat.transazionis?.reduce((s, tx) => s + (tx.Importo || 0), 0) || 0;
        return sum + speseCat;
      }, 0);
    },
    totaleRimanenti() {
      return this.totaleBudget - this.totaleSpesi;
    },
    categoriesFiltrate() {
      return this.categories.map((cat) => ({
        ...cat,
        transazionis:
          cat.transazionis?.filter((tx) => {
            const data = new Date(tx.Data);
            return (
              data.getMonth() === this.meseCorrente &&
              data.getFullYear() === this.annoCorrente
            );
          }) || [],
      }));
    },
    labelMese() {
      const data = new Date(this.annoCorrente, this.meseCorrente);
      return data.toLocaleDateString("it-IT", {
        month: "long",
        year: "numeric",
      });
    },
  },

  watch: {
    selectedWallet(nuovoWallet, vecchioWallet) {
      if (nuovoWallet) {
        this.loadCategories(nuovoWallet.documentId);
      }
    },
  },

  // Quando il componente viene montato, carica le categorie
  async mounted() {
    if (this.selectedWallet) {
      await this.loadCategories(this.selectedWallet.documentId);
    }
  },

  methods: {
    async loadCategories(walletId) {
      this.loading = true;
      try {
        //await new Promise((resolve) => setTimeout(resolve, 4000));
        const response = await this.$http.get("/api/categories", {
          params: {
            filters: {
              wallet: {
                documentId: { $eq: walletId },
              },
            },
            populate: "*",
          },
        });
        this.categories = response.data.data;
      } catch (err) {
        console.error("Errore caricamento categorie:", err);
      } finally {
        this.loading = false;
      }
    },
    mesePrecedente() {
      if (this.meseCorrente === 0) {
        this.meseCorrente = 11;
        this.annoCorrente--;
      } else {
        this.meseCorrente--;
      }
    },
    meseSuccessivo() {
      if (this.meseCorrente === 11) {
        this.meseCorrente = 0;
        this.annoCorrente++;
      } else {
        this.meseCorrente++;
      }
    },
    exportCSV() {
      const righe = [];
      // Header
      righe.push(
        "Categoria,Budget,Spesi,Rimanenti,Descrizione Transazione,Importo,Data",
      );

      this.categoriesFiltrate.forEach((cat) => {
        const spesi =
          cat.transazionis?.reduce((s, tx) => s + (tx.Importo || 0), 0) || 0;
        const rimanenti = (cat.Budget_categoria || 0) - spesi;

        if (cat.transazionis?.length > 0) {
          cat.transazionis.forEach((tx) => {
            const data = new Date(tx.Data).toLocaleDateString("it-IT");
            righe.push(
              `"${cat.Nome}","${cat.Budget_categoria || 0}","${spesi}","${rimanenti}","${tx.Descrizione || ""}","${tx.Importo || 0}","${data}"`,
            );
          });
        } else {
          righe.push(
            `"${cat.Nome}","${cat.Budget_categoria || 0}","${spesi}","${rimanenti}","","",""`,
          );
        }
      });

      const csv = righe.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `budget_${this.labelMese}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    },
    async onTransazioneEditSave(event) {
      const { newData } = event;
      try {
        await this.$http.put(`/api/transazionis/${newData.documentId}`, {
          data: {
            Descrizione: newData.Descrizione,
            Importo: newData.Importo,
            Data: newData.Data,
          },
        });
        // Aggiorna in locale
        const cat = this.categories.find((c) =>
          c.transazionis?.some((tx) => tx.documentId === newData.documentId),
        );
        if (cat) {
          const idx = cat.transazionis.findIndex(
            (tx) => tx.documentId === newData.documentId,
          );
          if (idx !== -1) cat.transazionis[idx] = { ...newData };
        }
      } catch (err) {
        console.error("Errore salvataggio transazione", err);
      }
    },

    async deleteRow(data) {
      try {
        //await new Promise((resolve) => setTimeout(resolve, 4000));

        const response = await this.$http.delete(
          `/api/transazionis/${data.documentId}`,
        );
        const cat = this.categories.find((c) =>
          c.transazionis?.some((tx) => tx.documentId === data.documentId),
        );
        if (cat) {
          cat.transazionis = cat.transazionis.filter(
            (tx) => tx.documentId !== data.documentId,
          );
        }
      } catch (err) {
        console.error("Errore eliminazione transazione", err);
      }
    },
  },
};
</script>

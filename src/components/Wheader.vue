<template>
  <div class="card mx-3 mt-3" v-if="loggedIn">
    <Toolbar style="border-radius: 3rem; padding: 1rem 1rem 1rem 1.5rem">
      <template #start>
        <div class="flex items-center gap-2 hidden md:flex">
          <Select
            v-model="selectedWallet"
            :options="wallets"
            optionLabel="Nome"
            placeholder="Wallet"
            size="small"
            style="border-radius: 20px; border: 0px"
          />
        </div>
        <div class="flex items-center gap-2 md:hidden">
          <Button
            icon="pi pi-bars"
            @click="visible = true"
            rounded
            severity="secondary"
            size="large"
          />
        </div>
      </template>
      <template #center>
        <div class="flex md:hidden">
          <PageTitle />
        </div>
        <div class="hidden md:flex">
          <Button
            v-for="item in menuItems"
            :key="item.to"
            :icon="item.icon"
            :label="item.label"
            text
            plain
            @click="$router.push(item.to)"
          />
        </div>
      </template>
      <template #end>
        <div class="hidden md:flex">
          <div class="flex items-center gap-2">
            <Button
              icon="pi pi-cog"
              severity="secondary"
              text
              rounded
              @click="$router.push('/impostazioni')"
            />
            <Button
              icon="pi pi-sign-out"
              severity="danger"
              @click="logout"
              text
              rounded
            />
          </div>
        </div>
      </template>
    </Toolbar>
  </div>

  <div class="card flex justify-center">
    <Drawer v-model:visible="visible">
      <template #container="{ closeCallback }">
        <div class="flex flex-col h-full">
          <div class="flex items-center justify-between px-6 pt-4 shrink-0">
            <span class="inline-flex items-center gap-2">
              <img src="/logo.svg" alt="Budget App" class="h-20 w-20" />

              <span class="font-semibold text-2xl text-primary">BudgetApp</span>
            </span>
            <span>
              <Button
                type="button"
                @click="closeCallback"
                icon="pi pi-times"
                rounded
                variant="outlined"
              ></Button>
            </span>
          </div>
          <div class="overflow-y-auto">
            <ul class="list-none p-0 m-0 mt-6 overflow-hidden">
              <div class="flex items-center ml-4 mb-4">
                <Select
                  v-model="selectedWallet"
                  :options="wallets"
                  optionLabel="Nome"
                  placeholder="Wallet"
                  size="medium"
                />
              </div>
              <li v-for="item in menuItems" :key="item.to" class="mb-1">
                <a
                  v-ripple
                  class="flex items-center cursor-pointer p-4 rounded text-surface-700 hover:bg-surface-100 dark:text-surface-0 dark:hover:bg-surface-800 duration-150 transition-colors p-ripple"
                  @click="
                    $router.push(item.to);
                    visible = false;
                  "
                >
                  <i :class="item.icon + ' mr-5'" style="font-size: 1.5rem"></i>
                  <span class="font-medium">{{ item.label }}</span>
                </a>
              </li>
            </ul>
          </div>
          <div class="mt-auto">
            <hr
              class="mb-4 mx-4 border-t border-0 border-surface-200 dark:border-surface-700"
            />
            <div
              class="ml-4 flex items-center cursor-pointer p-2 gap-2 rounded text-surface-700 hover:bg-surface-100 dark:text-surface-0 dark:hover:bg-surface-800 duration-150 transition-colors p-ripple"
            >
              <Button
                label="Impostazioni"
                icon="pi pi-cog"
                severity="secondary"
                @click="$router.push('/impostazioni')"
              />
            </div>
            <div
              class="ml-4 mb-4 flex items-center cursor-pointer p-2 gap-2 rounded text-surface-700 hover:bg-surface-100 dark:text-surface-0 dark:hover:bg-surface-800 duration-150 transition-colors p-ripple"
            >
              <Button
                label="Esci"
                icon="pi pi-sign-out"
                @click="logout"
                severity="danger"
              />
            </div>
          </div>
        </div>
      </template>
    </Drawer>
  </div>
</template>

<script>
import { useWalletStore } from "@/stores/wallet.js";

export default {
  data() {
    return {
      visible: false,
      menuItems: [
        { label: "Dashboard", icon: "pi pi-home", to: "/" },
        { label: "Transazioni", icon: "pi pi-credit-card", to: "/transazioni" },
        { label: "Risparmiato", icon: "pi pi-money-bill", to: "/risparmio" },
      ],
    };
  },
  computed: {
    loggedIn: function () {
      return this.$useAuthStore().isLoggedIn;
    },
    // Accede allo store
    walletStore() {
      return useWalletStore();
    },

    // Legge la lista wallet dalla lavagna
    wallets() {
      return this.walletStore.wallets;
    },

    // - quando LEGGE → chiama get() → legge dallo store
    // - quando SCRIVE (utente seleziona) → chiama set() → scrive nello store
    selectedWallet: {
      get() {
        return this.walletStore.selectedWallet;
      },
      set(wallet) {
        this.walletStore.setSelectedWallet(wallet);
      },
    },
  },

  async mounted() {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const response = await this.$http.get("/api/wallets");
      // Salva i wallet nello store (non più nel data locale)
      this.walletStore.setWallets(response.data.data);
    } catch (err) {
      console.error("Errore caricamento wallets:", err);
    }
  },
  methods: {
    async logout() {
      const store = this.$useAuthStore();
      try {
        store.logout();
        await this.$router.push("/login");
      } catch (err) {
        console.log(err);
      }
    },
  },
};
</script>

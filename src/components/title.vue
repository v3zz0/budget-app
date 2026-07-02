<template>
  <div class="hidden md:flex">
    <div
      class="text-surface-900 dark:text-surface-0 font-bold text-4xl leading-tight"
    >
      {{
        $route.meta.title ||
        (selectedWallet ? selectedWallet.Nome : "Seleziona un wallet")
      }}
    </div>
  </div>
  <div class="flex md:hidden">
    <div
      class="text-surface-900 dark:text-surface-0 font-bold text-xl leading-tight"
    >
      {{
        $route.meta.title ||
        (selectedWallet ? selectedWallet.Nome : "Seleziona un wallet")
      }}
    </div>
  </div>
</template>
<script>
import { useWalletStore } from "@/stores/wallet.js";

export default {
  props: {
    title: {
      type: String,
      default: null,
    },
  },
  computed: {
    selectedWallet() {
      return useWalletStore().selectedWallet;
    },
  },
};
</script>

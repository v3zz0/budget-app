<script setup>
// Le 16 emoji Apple tra cui scegliere (categorie, salvadanai).
defineProps({ emoji: { type: Array, default: () => EMOJI } });
const scelta = defineModel({ type: String, default: "" });
</script>

<script>
export const EMOJI = ["🛒", "🍔", "🏠", "🚗", "⛽", "💊", "🎬", "🏖️", "👕", "📱", "💡", "🎁", "📚", "🐾", "☕", "🏷️"];
export const EMOJI_ENTRATE = ["💼", "🎨", "↩️", "💰", "🏦", "🎁", "📈", "🧾", "💶", "🏠", "🚗", "🎓", "🤝", "🪙", "📦", "🏷️"];
</script>

<template>
  <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Emoji">
    <button
      v-for="e in emoji"
      :key="e"
      type="button"
      role="radio"
      :aria-checked="scelta === e"
      class="grid h-[42px] w-[42px] place-items-center rounded-xl bg-card text-[22px]"
      :class="{ 'shadow-[inset_0_0_0_2px_var(--color-testo)]': scelta === e }"
      @click="scelta = e"
    >
      <Emoji :e="e" />
    </button>
  </div>
</template>

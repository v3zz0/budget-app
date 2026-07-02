<template>
  <div>
    <Toast
      position="bottom-center"
      :pt="{ root: { style: 'width: 90vw; max-width: 25rem' } }"
    />
    <Wheader v-if="$route.path !== '/login'"></Wheader>

    <router-view />
  </div>
</template>

<script>
import Wheader from "./components/Wheader.vue";

export default {
  name: "App",
  components: {
    Wheader,
  },
};
</script>

<style scoped></style>

<!-- src/components/Footer.vue -->
<template>
  <footer class="app-footer">
    <p>Trust your judgment.</p>
  </footer>
</template>

<script setup lang="ts">
</script>

<style scoped>
/* Styles from App.vue for footer can be moved here */
.app-footer {
  text-align: center;
  margin-top: auto; /* Push footer to bottom if content is short */
  padding: 1.5em 1em 1em 1em;
  border-top: 1px solid #dce4ec;
  font-size: 0.8em;
  color: #6c757d;
  flex-shrink: 0; /* Prevent footer from shrinking */
}
</style> 
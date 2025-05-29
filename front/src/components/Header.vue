<!-- src/components/Header.vue -->
<template>
  <header class="app-header">
    <h1>Mycoin</h1>
    <div class="current-price-display" v-if="currentMarketPriceDisplay">
      当前 {{ selectedCoinDisplay }} 市价: <strong>{{ currentMarketPriceDisplay }} USD</strong>
      <span v-if="isLoadingPriceGlobal && livePrices && selectedCoinDisplay && livePrices[selectedCoinDisplay] === '获取中...'">(获取中...)</span>
    </div>
    <div class="current-price-display" v-else-if="selectedCoinDisplay">
      {{ selectedCoinDisplay }} 市价: {{ (livePrices && selectedCoinDisplay && livePrices[selectedCoinDisplay]) || '(等待数据...)' }}
    </div>
    <div v-if="globalErrorMessage" class="error-message global-error">{{ globalErrorMessage }}</div>
    <div v-if="globalSuccessMessage" class="success-message global-success">{{ globalSuccessMessage }}</div>
  </header>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';

defineProps({
  selectedCoinDisplay: {
    type: String as PropType<string | null>,
    required: false,
  },
  currentMarketPriceDisplay: {
    type: String as PropType<string | null>,
    required: false,
  },
  livePrices: {
    type: Object as PropType<Record<string, string> | null>,
    required: false,
    default: () => ({}),
  },
  isLoadingPriceGlobal: {
    type: Boolean,
    required: false,
  },
  globalErrorMessage: {
    type: String as PropType<string | null>,
    required: false,
  },
  globalSuccessMessage: {
    type: String as PropType<string | null>,
    required: false,
  }
});
</script>

<style scoped>
/* Styles from App.vue for header can be moved here */
.app-header {
  background-color: #2c3e50;
  color: white;
  padding: 1em 1.5em;
  border-radius: 8px;
  margin-bottom: 1.5em;
  text-align: center;
  flex-shrink: 0;
}

.app-header h1 {
  margin: 0 0 0.5em 0;
  font-size: 1.8em;
}

.current-price-display {
  font-size: 1.1em;
  color: #ecf0f1;
  margin-bottom: 0.5em; /* Added margin for spacing */
}
.current-price-display strong {
  color: #f1c40f;
}

.global-error, .global-success {
  padding: 0.8em 1em;
  margin-top: 0.5em; /* Added margin for spacing */
  border-radius: 4px;
  text-align: center;
  color: white;
}
.global-error {
  background-color: #e74c3c;
}
.global-success {
  background-color: #2ecc71;
}
</style> 
<!-- src/components/RealizedPnlHistory.vue -->
<template>
  <section class="realized-pnl-history-section main-column-layout">
    <h2>历史持仓盈亏 <button @click="onRefreshPnl" :disabled="isLoading" class="refresh-button">刷新</button></h2>
    <div v-if="isLoading && (!pnlHistory || pnlHistory.length === 0)" class="loading-text">正在加载历史盈亏...</div>
    <div v-else-if="!pnlHistory || pnlHistory.length === 0" class="info-text">暂无历史持仓盈亏记录</div>
    <div v-else class="history-table-wrapper">
      <table>
        <thead>
          <tr>
            <th>平仓时间</th>
            <th>币种</th>
            <th>方向</th>
            <th>数量</th>
            <th>开仓均价 (USD)</th>
            <th>平仓均价 (USD)</th>
            <th>已实现盈亏 (USD)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="pnlEntry in pnlHistory" :key="pnlEntry.id">
            <td>{{ formatDateTime(pnlEntry.closed_at) }}</td>
            <td>{{ pnlEntry.coin }}</td>
            <td :class="pnlEntry.initial_direction === 'LONG' ? 'type-buy' : 'type-sell'">
              {{ pnlEntry.initial_direction === 'LONG' ? '多' : '空' }}
            </td>
            <td>{{ formatNumber(pnlEntry.total_quantity_closed, 8) }}</td>
            <td>{{ formatNumber(pnlEntry.avg_entry_price, 2) }}</td>
            <td>{{ formatNumber(pnlEntry.avg_exit_price, 2) }}</td>
            <td :class="pnlEntry.realized_pnl >= 0 ? 'pnl-positive' : 'pnl-negative'">
              {{ formatNumber(pnlEntry.realized_pnl, 2) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';

interface RealizedPnlEntry {
  id: number;
  coin: string;
  initial_direction: 'LONG' | 'SHORT';
  total_quantity_closed: number;
  avg_entry_price: number;
  avg_exit_price: number;
  realized_pnl: number;
  closed_at: string;
}

defineProps({
  pnlHistory: {
    type: Array as PropType<RealizedPnlEntry[] | null>,
    required: true,
  },
  isLoading: {
    type: Boolean,
    default: false,
  }
});

const emit = defineEmits(['refresh-pnl']);

const onRefreshPnl = () => {
  emit('refresh-pnl');
};

const formatDateTime = (dateTimeString: string | undefined) => {
  if (!dateTimeString) return 'N/A';
  try { return new Date(dateTimeString).toLocaleString('zh-CN', { hour12: false }); }
  catch (e) { return dateTimeString; }
};

const formatNumber = (num: number | string | undefined | null, precision: number): string => {
  if (num === undefined || num === null) return '-';
  const parsed = parseFloat(num.toString());
  if (isNaN(parsed)) return '-';
  return parsed.toFixed(precision);
};

</script>

<style scoped>
.realized-pnl-history-section {
  background-color: #ffffff;
  padding: 1.5em;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  margin-top: 1.5em;
  display: flex;
  flex-direction: column;
  min-height: 200px; /* Ensure it has some base height */
  width: 100%; 
  box-sizing: border-box;
}

.realized-pnl-history-section h2 {
  margin-top: 0;
  color: #2c3e50;
  border-bottom: 1px solid #dce4ec;
  padding-bottom: 0.6em;
  margin-bottom: 1.2em;
  font-size: 1.4em;
  display: flex; /* For aligning button */
  justify-content: space-between;
  align-items: center;
}

.history-table-wrapper { 
  overflow-x: auto; 
  flex-grow: 1; /* Allow table to take available vertical space */
}
table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
thead th { background-color: #f0f4f8; padding: 0.6em 0.8em; text-align: left; font-weight: 600; color: #4a5568; border-bottom: 2px solid #dce4ec; }
tbody td { padding: 0.6em 0.8em; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover { background-color: #f9fafb; }

.pnl-positive { color: #22c55e; font-weight: 500; }
.pnl-negative { color: #ef4444; font-weight: 500; }
.type-buy { color: #22c55e; font-weight: 500; }
.type-sell { color: #ef4444; font-weight: 500; }

.refresh-button {
  background-color: #5bc0de; 
  color: white;
  padding: 0.4em 0.8em;
  font-size: 0.8em;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.refresh-button:hover:not(:disabled) {
  background-color: #31b0d5;
}
.refresh-button:disabled {
  background-color: #a0b3c4;
  cursor: not-allowed;
}

.loading-text, .info-text {
  color: #555;
  font-style: italic;
  padding: 1em 0;
  text-align: center;
  flex-grow: 1;
}
</style> 
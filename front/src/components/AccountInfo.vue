<!-- src/components/AccountInfo.vue -->
<template>
  <section class="account-info main-column">
    <h2>账户信息</h2>
    <div v-if="isLoadingAccountData && !balance" class="loading-text">正在加载账户数据...</div>
    <div v-else class="account-details">
      <div class="balance-summary">
        <div class="balance-item">
          <span class="label">现金余额:</span>
          <span class="value">{{ formatNumber(currentUsdBalanceDisplay, 2) }} USD</span>
        </div>
        <div class="balance-item">
          <span class="label">仓位价值:</span>
          <span class="value" :class="{
            'pnl-positive': totalPositionValueDisplay > 0,
            'pnl-negative': totalPositionValueDisplay < 0
          }">{{ formatNumber(totalPositionValueDisplay, 2) }} USD</span>
        </div>
        <div class="balance-item total-equity">
          <span class="label">账户总权益:</span>
          <span class="value">{{ formatNumber(calculatedTotalEquity, 2) }} USD</span>
        </div>
      </div>

      <h3>当前持仓: <button @click="onRefreshHoldings" :disabled="isLoadingAccountData" class="refresh-button">刷新</button></h3>
      <div v-if="isLoadingAccountData && (!holdings || holdings.length === 0)" class="loading-text">加载持仓数据中...</div>
      <div v-else-if="holdings && holdings.length > 0" class="holdings-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>币种</th>
              <th>方向</th>
              <th>数量</th>
              <th>均价</th>
              <th>市价</th>
              <th>仓位价值</th>
              <th>预估盈亏</th>
              <th>预估爆仓价</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="holding in holdings" :key="holding.coin">
              <td>{{ holding.coin }}</td>
              <td :class="parseFloat(holding.quantity.toString()) > 0 ? 'type-buy' : 'type-sell'">
                {{ parseFloat(holding.quantity.toString()) > 0 ? '多' : '空' }}
              </td>
              <td>{{ formatNumber(holding.quantity, 4) }}</td>
              <td>{{ formatNumber(holding.avg_cost, 2) }}</td>
              <td>{{ (livePrices && livePrices[holding.coin]) ? formatNumber(livePrices[holding.coin], 2) : '-' }}</td>
              <td>
                {{ 
                  (livePrices && livePrices[holding.coin] && parseFloat(holding.quantity.toString()) !== 0 && livePrices[holding.coin] !== '获取中...' && livePrices[holding.coin] !== '错误') ? 
                  formatNumber(Math.abs(parseFloat(holding.quantity.toString())) * parseFloat(livePrices[holding.coin]), 2) : '-' 
                }}
              </td>
              <td :class="{
                  'pnl-positive': holdings && livePrices && pnlForHolding(holding) !== null && pnlForHolding(holding)! > 0,
                  'pnl-negative': holdings && livePrices && pnlForHolding(holding) !== null && pnlForHolding(holding)! < 0
                }">
                {{ formatNumber(pnlForHolding(holding), 2) }}
              </td>
              <td>{{ formatNumber(calculateLiquidationPrice(holding), 2) }}</td>
              <td>
                <button @click="onCloseMarketPosition(holding.coin)" :disabled="isClosingPosition || !canClosePosition(holding)" class="close-button">
                  市价平仓
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="info-text">暂无持仓</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';

interface Holding {
  coin: string;
  quantity: number;
  avg_cost: number;
  open_leverage?: number;
}

interface Balance {
  currency: string;
  amount: number;
}

const props = defineProps({
  balance: {
    type: Object as PropType<Balance | null>,
    required: false,
  },
  holdings: {
    type: Array as PropType<Holding[] | null>,
    required: true,
  },
  livePrices: {
    type: Object as PropType<Record<string, string> | null>,
    required: true,
  },
  isLoadingAccountData: {
    type: Boolean,
    default: false,
  },
  isClosingPosition: {
    type: Boolean,
    default: false,
  },
  currentLeverage: {
    type: Number as PropType<number>,
    default: 1,
  }
});

const emit = defineEmits([
  'refresh-account-data', 
  'close-position'
]);

const currentUsdBalanceDisplay = computed(() => {
  return props.balance ? parseFloat(props.balance.amount.toString()) : 0;
});

const positionValueBasedOnMarginAndPnl = (holding: Holding): number | null => {
  const holdingLeverage = holding.open_leverage || 1;
  if (!props.livePrices || !props.livePrices[holding.coin] || 
      props.livePrices[holding.coin] === '获取中...' || 
      props.livePrices[holding.coin] === '错误' || 
      isNaN(parseFloat(props.livePrices[holding.coin])) ||
      isNaN(holding.avg_cost) ||
      holdingLeverage <= 0) {
    return null;
  }

  const initialMargin = (Math.abs(holding.quantity) * holding.avg_cost) / holdingLeverage;
  const currentPnl = pnlForHolding(holding);

  if (currentPnl === null) return null;
  
  return initialMargin + currentPnl;
};

const totalPositionValueDisplay = computed(() => {
  let totalValue = 0;
  if (props.holdings) {
    for (const holding of props.holdings) {
      const value = positionValueBasedOnMarginAndPnl(holding);
      if (value !== null) {
        totalValue += value;
      }
    }
  }
  return totalValue;
});

const calculatedTotalEquity = computed(() => {
  return currentUsdBalanceDisplay.value + totalPositionValueDisplay.value;
});

const formatNumber = (num: number | string | undefined | null, precision: number): string => {
  if (num === undefined || num === null) return '-';
  const parsed = parseFloat(num.toString());
  if (isNaN(parsed)) return '-';
  return parsed.toFixed(precision);
};

const pnlForHolding = (holding: Holding): number | null => {
  if (props.livePrices && props.livePrices[holding.coin] && 
      props.livePrices[holding.coin] !== '获取中...' && 
      props.livePrices[holding.coin] !== '错误' && 
      holding.quantity !== 0 && 
      !isNaN(parseFloat(props.livePrices[holding.coin])) && 
      !isNaN(holding.avg_cost)
  ) {
    const currentPrice = parseFloat(props.livePrices[holding.coin]);
    return (currentPrice - holding.avg_cost) * holding.quantity;
  }
  return null;
};

// 假设有一个全局或从配置中获取的维持保证金率，用于计算 *其他* 仓位的维持保证金
const GLOBAL_MAINTENANCE_MARGIN_RATE = 0.005; // 示例：0.5%

const calculateLiquidationPrice = (targetHolding: Holding): number | null => {
  if (!props.livePrices || !props.livePrices[targetHolding.coin] || 
      props.livePrices[targetHolding.coin] === '获取中...' || 
      props.livePrices[targetHolding.coin] === '错误' || 
      isNaN(parseFloat(props.livePrices[targetHolding.coin]))) {
    return null;
  }
  const currentMarketPrice = parseFloat(props.livePrices[targetHolding.coin]);
  const targetQty = parseFloat(targetHolding.quantity.toString());

  if (isNaN(targetQty) || targetQty === 0) {
    return null;
  }

  const totalEquity = calculatedTotalEquity.value;

  let liquidationPrice: number;

  if (targetQty > 0) { // 多头
    liquidationPrice = currentMarketPrice - (totalEquity / targetQty);
  } else { // 空头 (targetQty < 0)
    liquidationPrice = currentMarketPrice + (totalEquity / Math.abs(targetQty));
  }

  if (liquidationPrice <= 0) {
    return null;
  }

  // 对于多头，爆仓价不应高于当前市价（除非总权益为负）
  // 对于空头，爆仓价不应低于当前市价（除非总权益为负）
  // 暂时不加这个限制，因为totalEquity可能为负导致反直觉的结果，但公式本身是对的
  // if (targetQty > 0 && liquidationPrice > currentMarketPrice && totalEquity > 0) return null;
  // if (targetQty < 0 && liquidationPrice < currentMarketPrice && totalEquity > 0) return null;


  return liquidationPrice;
};

const canClosePosition = (holding: Holding): boolean => {
    return !!(props.livePrices && props.livePrices[holding.coin] && props.livePrices[holding.coin] !== '获取中...' && props.livePrices[holding.coin] !== '错误');
};

const onRefreshHoldings = () => {
  emit('refresh-account-data');
};

const onCloseMarketPosition = (coin: string) => {
  const holdingToClose = props.holdings?.find(h => h.coin === coin);
  if (holdingToClose) {
    emit('close-position', coin, holdingToClose.open_leverage || props.currentLeverage);
  } else {
    emit('close-position', coin, props.currentLeverage);
  }
};

</script>

<style scoped>
.account-info {
  background-color: #ffffff;
  padding: 1.5em;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
}

.account-info h2, .account-info h3 {
  margin-top: 0;
  color: #34495e;
  border-bottom: 1px solid #dce4ec; 
  padding-bottom: 0.6em;
  margin-bottom: 1em;
}
.account-info h3 {
  font-size: 1.1em; 
  border-bottom-style: dashed; 
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.account-details { 
  flex-grow: 1; 
  display: flex; 
  flex-direction: column; 
}
.balance-summary {
  background-color: #e9f5fc;
  padding: 0.8em 1em;
  border-radius: 6px;
  margin-bottom: 1.5em;
  border-left: 4px solid #3498db;
}
.balance-item {
  display: flex;
  justify-content: space-between;
  padding: 0.3em 0;
  font-size: 1em;
  color: #1a2b3c;
}
.balance-item .label {
  font-weight: 500;
  color: #2c3e50;
}
.balance-item .value {
  font-weight: bold;
}
.balance-item.total-equity {
    font-size: 1.1em;
}

.holdings-table-wrapper { 
  overflow-x: auto; 
  flex-grow: 1;
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

.close-button {
  background-color: #e74c3c;
  color: white;
  padding: 0.5em 0.8em;
  font-size: 0.85em;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.close-button:hover:not(:disabled) { background-color: #c0392b; }
.close-button:disabled {
  background-color: #a0b3c4; 
  cursor: not-allowed;
}

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
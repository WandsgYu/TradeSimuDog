<!-- src/components/TradingTerminal.vue -->
<template>
  <section class="control-panel">
    <h2>行情与交易</h2>
    <div class="form-group coin-selector-tabs-group">
      <label>交易币种:</label>
      <div class="coin-tabs">
        <button
          v-for="coin in presetCoins"
          :key="coin.value"
          @click="onSelectCoinFromTab(coin.value)"
          :class="{ active: selectedCoin === coin.value && !internalShowCustomCoinInput }"
          class="coin-tab-button">
          {{ coin.text }}
        </button>
        <button @click="onToggleCustomCoinInput"
                :class="{ active: internalShowCustomCoinInput }"
                class="coin-tab-button custom-coin-toggle-button">
          {{ internalShowCustomCoinInput ? '完成输入' : '自定义...' }}
        </button>
      </div>
      <div v-if="internalShowCustomCoinInput" class="custom-coin-input-wrapper form-group">
        <input
          type="text"
          id="custom-coin-input-terminal"
          v-model="internalUserInputCoin"
          @keyup.enter="onHandleCoinInputChange"
          @blur="onHandleCoinInputChange"
          placeholder="例如：XRP-USDT-SWAP 或 XRP">
      </div>
    </div>

    <form @submit.prevent="onSubmitMarketOrder" class="trade-form">
      <fieldset>
        <legend>市价开仓</legend>
        <div class="form-group">
          <label for="leverage-slider">杠杆倍数: {{ leverage }}x</label>
          <input type="range" id="leverage-slider" v-model.number="leverage" :min="minLeverage" :max="maxLeverage" step="1" class="leverage-slider">
          <div>最大可开名义价值: <span :class="{ 'value-exceeded': isNominalValueExceedingMax }">{{ formatNumber(maxOpenablePositionValueBasedOnLeverage, 2) }} USD</span></div>
        </div>

        <div class="form-group">
          <label>操作类型:</label>
          <div class="button-group">
            <button type="button" :class="{ active: internalTradeSide === 'BUY', 'side-buy': internalTradeSide === 'BUY' }" @click="setInternalTradeSide('BUY')">开多 (买入)</button>
            <button type="button" :class="{ active: internalTradeSide === 'SELL', 'side-sell': internalTradeSide === 'SELL' }" @click="setInternalTradeSide('SELL')">开空 (卖出)</button>
          </div>
        </div>

        <div class="form-group">
          <label for="order-size-slider">订单大小: {{ orderSizePercentage.toFixed(0) }}%</label>
          <input type="range" id="order-size-slider" v-model.number="orderSizePercentage" min="0" max="100" step="1" class="leverage-slider">
        </div>

        <div class="form-group">
          <label for="trade-value-input-terminal">名义价值 :</label>
          <input type="number" id="trade-value-input-terminal" v-model="internalTradeValueInput" placeholder="例如 1000" :disabled="!currentMarketPrice" min="0" step="any">
          <small v-if="isNominalValueExceedingMax && parseFloat(internalTradeValueInput) > maxOpenablePositionValueBasedOnLeverage" class="error-message">
            输入的名义价值超过最大可开仓位 ({{ formatNumber(maxOpenablePositionValueBasedOnLeverage, 2) }} USD).
          </small>
        </div>

        <div class="form-group">
          <label for="trade-quantity-input-terminal">{{ (selectedCoin?.split('-')[0] || '币') }} 数量:</label>
          <input type="number" id="trade-quantity-input-terminal" v-model="internalTradeQuantityInput" :placeholder="`例如 0.1`" :disabled="!currentMarketPrice" min="0" step="any">
        </div>

        <button type="submit" :disabled="isSubmittingOrder || !currentMarketPrice || !(parseFloat(internalTradeValueInput) > 0) || (isNominalValueExceedingMax && parseFloat(internalTradeValueInput) > maxOpenablePositionValueBasedOnLeverage)"
                :class="{ 'side-buy': internalTradeSide === 'BUY', 'side-sell': internalTradeSide === 'SELL' }"
                class="submit-button">
          {{ isSubmittingOrder ? '提交中...' : '提交市价单' }}
        </button>
      </fieldset>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue';
import type { PropType } from 'vue';

interface PresetCoin {
  text: string;
  value: string;
}

// Define Balance interface locally or import if available globally
interface Balance {
  currency: string;
  amount: number;
}

const props = defineProps({
  selectedCoin: {
    type: String as PropType<string | null>,
    required: true,
  },
  currentMarketPrice: {
    type: String as PropType<string | null>,
    required: false,
  },
  presetCoins: {
    type: Array as PropType<PresetCoin[]>,
    required: true,
  },
  isSubmittingOrder: {
    type: Boolean,
    default: false,
  },
  balance: { // Added balance prop
    type: Object as PropType<Balance | null>,
    default: () => null,
  }
});

const emit = defineEmits([
  'update:selectedCoin',
  'submit-order',
  'toggle-custom-input-visibility',
  'user-input-change',
  'leverage-change'
]);

// --- Leverage State ---
const leverage = ref(1); // Default leverage 1x
const minLeverage = 1;
const maxLeverage = 100;

// --- Internal State ---
const internalUserInputCoin = ref(props.selectedCoin || '');
const internalShowCustomCoinInput = ref(false);
const internalTradeSide = ref<'BUY' | 'SELL'>('BUY');
const internalTradeValueInput = ref('');
const internalTradeQuantityInput = ref('');
const isUpdatingProgrammatically = ref(false);
const orderSizePercentage = ref(0);
const lastUserInteraction = ref<'nominal' | 'quantity' | 'slider' | null>(null);


// --- Computed Properties ---
const currentUsdBalanceAmount = computed(() => {
  return props.balance ? parseFloat(props.balance.amount.toString()) : 0;
});

const maxOpenablePositionValueBasedOnLeverage = computed(() => {
  return currentUsdBalanceAmount.value * leverage.value;
});

const isNominalValueExceedingMax = computed(() => {
  if (internalTradeValueInput.value) {
    const enteredValue = parseFloat(internalTradeValueInput.value);
    // Allow a small tolerance for floating point issues if needed, or ensure rounding consistency
    return enteredValue > maxOpenablePositionValueBasedOnLeverage.value + 0.000001; // Small tolerance
  }
  return false;
});

// --- Watchers ---
watch(() => props.selectedCoin, (newVal) => {
  if (newVal && newVal !== internalUserInputCoin.value && !internalShowCustomCoinInput.value) {
    internalUserInputCoin.value = newVal;
  }
});

watch(leverage, (newLeverage) => {
  emit('leverage-change', newLeverage);
  // When leverage changes, maxOpenablePositionValueBasedOnLeverage updates,
  // which should trigger its watcher to update the slider percentage.
});

watch(internalTradeValueInput, (newValue) => {
  if (isUpdatingProgrammatically.value) return;
  lastUserInteraction.value = 'nominal';
  isUpdatingProgrammatically.value = true;

  const nominal = parseFloat(newValue);
  const priceString = props.currentMarketPrice;
  if (!isNaN(nominal) && nominal > 0 && priceString && priceString !== '获取中...' && priceString !== '错误') {
    const price = parseFloat(priceString);
    if (price > 0) {
      internalTradeQuantityInput.value = (nominal / price).toFixed(8);
    }
    if (maxOpenablePositionValueBasedOnLeverage.value > 0) {
      orderSizePercentage.value = Math.min(100, Math.max(0, (nominal / maxOpenablePositionValueBasedOnLeverage.value) * 100));
    }
  } else if (newValue === '') {
    internalTradeQuantityInput.value = '';
    orderSizePercentage.value = 0;
  }
  nextTick(() => { isUpdatingProgrammatically.value = false; });
});

watch(internalTradeQuantityInput, (newValue) => {
  if (isUpdatingProgrammatically.value) return;
  lastUserInteraction.value = 'quantity';
  isUpdatingProgrammatically.value = true;

  const quantity = parseFloat(newValue);
  const priceString = props.currentMarketPrice;
  if (!isNaN(quantity) && quantity > 0 && priceString && priceString !== '获取中...' && priceString !== '错误') {
    const price = parseFloat(priceString);
    if (price > 0) {
      const newNominal = quantity * price;
      internalTradeValueInput.value = newNominal.toFixed(2);
      if (maxOpenablePositionValueBasedOnLeverage.value > 0) {
        orderSizePercentage.value = Math.min(100, Math.max(0, (newNominal / maxOpenablePositionValueBasedOnLeverage.value) * 100));
      }
    }
  } else if (newValue === '') {
    internalTradeValueInput.value = '';
    orderSizePercentage.value = 0;
  }
  nextTick(() => { isUpdatingProgrammatically.value = false; });
});

watch(orderSizePercentage, (newPercentage) => {
  if (isUpdatingProgrammatically.value) return;
  lastUserInteraction.value = 'slider';
  isUpdatingProgrammatically.value = true;

  const priceString = props.currentMarketPrice;
  if (priceString && priceString !== '获取中...' && priceString !== '错误' && maxOpenablePositionValueBasedOnLeverage.value > 0) {
    const price = parseFloat(priceString);
    if (price > 0) {
      const newNominal = (newPercentage / 100) * maxOpenablePositionValueBasedOnLeverage.value;
      internalTradeValueInput.value = newNominal.toFixed(2);
      // Manually update quantity here as the nominal input's watcher might be skipped
      internalTradeQuantityInput.value = (newNominal / price).toFixed(8);
    }
  } else if (newPercentage === 0) {
      internalTradeValueInput.value = '0'; 
      internalTradeQuantityInput.value = '0'; 
  }
  nextTick(() => { isUpdatingProgrammatically.value = false; });
});

watch(maxOpenablePositionValueBasedOnLeverage, (newMaxOpenable) => {
  if (lastUserInteraction.value === 'slider' || !internalTradeValueInput.value || parseFloat(internalTradeValueInput.value) === 0) { 
    if (isUpdatingProgrammatically.value) return;
    isUpdatingProgrammatically.value = true;

    const currentPercentage = orderSizePercentage.value;
    const priceString = props.currentMarketPrice;
    const price = priceString ? parseFloat(priceString) : 0;

    if (newMaxOpenable > 0 && price > 0) {
        const newNominal = (currentPercentage / 100) * newMaxOpenable;
        internalTradeValueInput.value = newNominal.toFixed(2);
        // Manually update quantity here as well
        internalTradeQuantityInput.value = (newNominal / price).toFixed(8);
    } else {
        internalTradeValueInput.value = '0';
        internalTradeQuantityInput.value = '0';
        orderSizePercentage.value = 0; // Reset percentage if max is 0 or no price
    }
    nextTick(() => { isUpdatingProgrammatically.value = false; });
  } else {
    const nominal = parseFloat(internalTradeValueInput.value);
    if (!isNaN(nominal) && newMaxOpenable > 0) {
        orderSizePercentage.value = Math.min(100, Math.max(0, (nominal / newMaxOpenable) * 100));
    }
  }
});

// --- Methods ---
const formatNumber = (num: number | string | undefined | null, precision: number): string => {
  if (num === undefined || num === null) return '-';
  const parsed = parseFloat(num.toString());
  if (isNaN(parsed)) return '-';
  return parsed.toFixed(precision);
};

const onSelectCoinFromTab = (coinValue: string) => {
  internalShowCustomCoinInput.value = false;
  internalUserInputCoin.value = coinValue;
  emit('update:selectedCoin', coinValue);
  emit('toggle-custom-input-visibility', false);
};

const onToggleCustomCoinInput = () => {
  internalShowCustomCoinInput.value = !internalShowCustomCoinInput.value;
  if (internalShowCustomCoinInput.value) {
    nextTick(() => {
        const inputEl = document.getElementById('custom-coin-input-terminal');
        inputEl?.focus();
    });
  }
  emit('toggle-custom-input-visibility', internalShowCustomCoinInput.value);
};

const onHandleCoinInputChange = () => {
  let finalCoin = internalUserInputCoin.value.trim().toUpperCase();
  if (finalCoin && !finalCoin.includes('-') && !finalCoin.includes('SWAP') && finalCoin.length > 0 && finalCoin.length < 10) {
    finalCoin += '-USDT-SWAP';
  }
  if (finalCoin && finalCoin !== props.selectedCoin) {
    emit('update:selectedCoin', finalCoin);
  }
  emit('user-input-change', finalCoin);
};

const setInternalTradeSide = (side: 'BUY' | 'SELL') => {
  internalTradeSide.value = side;
};

const onSubmitMarketOrder = () => {
  if (props.isSubmittingOrder || !props.currentMarketPrice) return;

  const nominalValue = parseFloat(internalTradeValueInput.value);

  if (isNaN(nominalValue) || nominalValue <= 0) {
    // Consider emitting an error or showing a local message
    console.error("无效的名义价值");
    return;
  }
  
  // Always submit by NOMINALVALUE now
  emit('submit-order', {
    coin: internalUserInputCoin.value, // Or props.selectedCoin if internalUserInputCoin is not the final source
    side: internalTradeSide.value,
    sizeBy: 'NOMINALVALUE',
    value: nominalValue 
  });
};

</script>

<style scoped>
/* Styles moved from App.vue for .control-panel, .form-group, .coin-selector-tabs-group, etc. */
.control-panel {
  background-color: #ffffff;
  padding: 1.5em;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  flex-shrink: 0;
}

.control-panel h2 {
  margin-top: 0;
  color: #34495e;
  border-bottom: 2px solid #3498db;
  padding-bottom: 0.5em;
  margin-bottom: 1em;
}

.form-group {
  margin-bottom: 1.2em;
}

.form-group label {
  display: block;
  margin-bottom: 0.4em;
  font-weight: 600;
  color: #555;
}

.form-group input[type="text"],
.form-group input[type="number"] {
  width: 100%;
  padding: 0.7em;
  border: 1px solid #bdc3c7;
  border-radius: 4px;
  box-sizing: border-box;
  font-size: 0.95em;
}

.form-group input:disabled {
  background-color: #ecf0f1;
  cursor: not-allowed;
}

.trade-form fieldset {
  border: 1px solid #dde2e7;
  padding: 1em;
  border-radius: 6px;
}
.trade-form legend {
  font-weight: bold;
  color: #3498db;
  padding: 0 0.5em;
}

button {
  background-color: #3498db;
  color: white;
  padding: 0.8em 1.2em;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1em;
  transition: background-color 0.2s ease;
}
button:hover:not(:disabled) {
  background-color: #2980b9;
}
button:disabled {
  background-color: #a0b3c4;
  cursor: not-allowed;
}

.button-group {
  display: flex;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #3498db;
}
.button-group button {
  flex: 1;
  padding: 0.7em 0.5em;
  background-color: #fdfdfe;
  color: #3498db;
  border: none;
  cursor: pointer;
  font-size: 0.85em;
  font-weight: 500;
  transition: background-color 0.2s ease, color 0.2s ease;
  border-radius: 0;
}
.button-group button:not(:last-child) {
  border-right: 1px solid #3498db;
}
.button-group button.active {
  background-color: #3498db;
  color: white;
}
.button-group button:hover:not(.active):not(:disabled) {
  background-color: #e6f4ff;
}

.coin-selector-tabs-group label {
  margin-bottom: 0.5em;
}
.coin-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
  margin-bottom: 0.5em;
}
.coin-tab-button {
  padding: 0.6em 1em;
  border: 1px solid #cbd5e0;
  background-color: #f8f9fa;
  color: #495057;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9em;
  font-weight: 500;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}
.coin-tab-button:hover {
  border-color: #3498db;
  color: #3498db;
}
.coin-tab-button.active {
  background-color: #3498db;
  color: white;
  border-color: #3498db;
}
.custom-coin-toggle-button {
  background-color: #6c757d;
  color: white;
  border-color: #6c757d;
}
.custom-coin-toggle-button:hover {
  background-color: #5a6268;
  border-color: #545b62;
}
.custom-coin-input-wrapper {
  margin-top: 0.8em;
}
.trade-form button[type="submit"] {
    width: 100%;
    margin-top: 0.5em;
    background-color: #27ae60;
    font-size: 1em;
}
.trade-form button[type="submit"]:hover:not(:disabled) {
    background-color: #229954;
}
.trade-form button[type="submit"]:disabled {
    background-color: #95a5a6;
}

.leverage-slider {
  width: 100%;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}

.error-message {
  color: #e74c3c;
  font-size: 0.85em;
  display: block;
  margin-top: 0.3em;
}

.value-exceeded {
  color: #e74c3c;
  font-weight: bold;
}

/* Dynamic BUY/SELL colors for type selection buttons */
.button-group button.active.side-buy {
  background-color: #28a745; /* Green for BUY */
  border-color: #28a745;
}

.button-group button.active.side-sell {
  background-color: #dc3545; /* Red for SELL */
  border-color: #dc3545;
}

/* Default state for non-active buttons when a side is chosen */
.button-group button.side-buy:not(.active) {
  /* Optional: style for non-active BUY button if needed, e.g., light green border */
}
.button-group button.side-sell:not(.active) {
  /* Optional: style for non-active SELL button if needed, e.g., light red border */
}

.submit-button {
  width: 100%;
  padding: 0.8em;
  font-size: 1em;
  border: none;
  border-radius: 5px;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s ease, opacity 0.2s ease;
  background-color: #007bff; /* Default color, will be overridden */
}

.submit-button.side-buy {
  background-color: #28a745; /* Green for BUY */
}

.submit-button.side-sell {
  background-color: #dc3545; /* Red for SELL */
}

.submit-button:disabled {
  background-color: #6c757d; /* Grey out when disabled */
  opacity: 0.7;
  cursor: not-allowed;
}

</style> 
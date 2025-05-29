<script setup lang="ts">
import { ref, onMounted, watch, computed, nextTick } from 'vue';
import Header from './components/Header.vue'; // 导入 Header 组件
import Footer from './components/Footer.vue'; // 导入 Footer 组件
import TradingTerminal from './components/TradingTerminal.vue'; // 导入 TradingTerminal 组件
import AccountInfo from './components/AccountInfo.vue'; // 导入 AccountInfo 组件
import RealizedPnlHistory from './components/RealizedPnlHistory.vue'; // 导入 RealizedPnlHistory 组件

// --- Enums and Types ---
interface Holding {
  coin: string;
  quantity: number;
  avg_cost: number;
  open_leverage?: number; // 新增：持仓的开仓杠杆
  current_price?: string; // Optional, can be fetched separately or via WebSocket
  unrealized_pnl?: number; // Optional
}

interface Balance {
  currency: string;
  amount: number;
}

interface PriceUpdate {
  arg?: { channel: string; instId: string };
  data?: Array<{ instId: string; markPx: string; ts: string }>;
  event?: string;
  msg?: string;
  code?: string;
}

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

interface PresetCoinType {
  text: string;
  value: string;
}

// Define PRESET_COINS first
const PRESET_COINS: PresetCoinType[] = [
  { text: 'BTC', value: 'BTC-USDT-SWAP' },
  { text: 'ETH', value: 'ETH-USDT-SWAP' },
  { text: 'SOL', value: 'SOL-USDT-SWAP' },
  { text: 'BNB', value: 'BNB-USDT-SWAP' },
  { text: 'DOGE', value: 'DOGE-USDT-SWAP' },
  { text: 'UNI', value: 'UNI-USDT-SWAP' },
  { text: 'SUI', value: 'SUI-USDT-SWAP' },
  { text: 'TRUMP', value: 'TRUMP-USDT-SWAP' }, 
  { text: 'PNUT', value: 'PNUT-USDT-SWAP' },   
  { text: 'MEME', value: 'MEME-USDT-SWAP' },
  { text: 'SHIB', value: 'SHIB-USDT-SWAP' },
];

// Initialize selectedCoinForTrading after PRESET_COINS is defined
const selectedCoinForTrading = ref<string | null>(PRESET_COINS.length > 0 ? PRESET_COINS[0].value : null);

const livePrices = ref<Record<string, string>>({});
const activeSubscriptions = ref(new Set<string>());
const errorMessage = ref<string | null>(null);
const isLoadingPriceGlobal = ref(false); // Broader loading state for initial WS connection

// --- Trading Form State ---
// tradeSide, sizeBy, tradeValueInput, tradeQuantityInput are now internal to TradingTerminal
const isSubmittingOrder = ref(false);
const tradeResponseMsg = ref<string | null>(null);

// --- Account State ---
const usdBalance = ref<Balance | null>(null);
const holdings = ref<Holding[]>([]);
const realizedPnlHistory = ref<RealizedPnlEntry[]>([]);
const isLoadingAccountData = ref(false);
const isLoadingRealizedPnl = ref(false);
const currentLeverageForCalculations = ref(1);

// --- Constants ---
const API_BASE_URL = 'http://localhost:3000/api';
let ws: WebSocket | null = null;

// --- Computed Properties ---
const currentMarketPriceForSelectedTradingCoin = computed(() => {
  if (selectedCoinForTrading.value) {
    return livePrices.value[selectedCoinForTrading.value] || null;
  }
  return null;
});

const allCoinsToMonitor = computed(() => {
  const coins = new Set<string>();
  if (selectedCoinForTrading.value && selectedCoinForTrading.value.trim() !== '') {
      coins.add(selectedCoinForTrading.value.trim());
  }
  holdings.value.forEach(h => {
      if (h.coin && h.coin.trim() !== '') {
          coins.add(h.coin.trim());
      }
  });
  return Array.from(coins);
});

// This totalEquity is for the Header display, AccountInfo calculates its own display values
const totalEquityForHeader = computed(() => {
  let currentUsd = usdBalance.value ? parseFloat(usdBalance.value.amount.toString()) : 0;
  let totalUnrealizedPnl = 0;
  if (holdings.value && livePrices.value) {
      for (const holding of holdings.value) {
        // Re-use pnlForHolding logic idea here
        const priceStr = livePrices.value[holding.coin];
        const quantity = parseFloat(holding.quantity.toString());
        const avgCost = parseFloat(holding.avg_cost.toString());

        if (priceStr && priceStr !== '获取中...' && priceStr !== '错误' && !isNaN(parseFloat(priceStr)) && parseFloat(priceStr) > 0 && quantity !== 0 && !isNaN(avgCost)) {
            const currentPrice = parseFloat(priceStr);
            totalUnrealizedPnl += (currentPrice - avgCost) * quantity;
        }
      }
  }
  return currentUsd + totalUnrealizedPnl;
});

// --- API Fetch Functions ---
async function fetchAccountData() {
  isLoadingAccountData.value = true;
  errorMessage.value = null;
  try {
    const [balanceRes, holdingsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/balance`),
      fetch(`${API_BASE_URL}/holdings`)
    ]);
    if (!balanceRes.ok) throw new Error(`获取余额失败: ${balanceRes.statusText}`);
    if (!holdingsRes.ok) throw new Error(`获取持仓失败: ${holdingsRes.statusText}`);
    usdBalance.value = await balanceRes.json();
    holdings.value = await holdingsRes.json();
    await nextTick(); // Ensure holdings ref is updated before manageSubscriptions uses it
    manageSubscriptions(); // Update subscriptions based on new holdings
  } catch (error: any) {
    errorMessage.value = error.message || '获取账户数据失败。';
    console.error('获取账户数据错误:', error);
  }
  isLoadingAccountData.value = false;
}

async function fetchRealizedPnlHistory() {
  isLoadingRealizedPnl.value = true;
  try {
    const response = await fetch(`${API_BASE_URL}/pnl/history`);
    if (!response.ok) throw new Error(`获取已实现盈亏历史失败: ${response.statusText}`);
    realizedPnlHistory.value = await response.json();
  } catch (error: any) {
    errorMessage.value = (errorMessage.value ? errorMessage.value + "; " : "") + (error.message || '获取已实现盈亏历史失败。');
    console.error('获取已实现盈亏历史错误:', error);
  } finally {
    isLoadingRealizedPnl.value = false;
  }
}

// --- WebSocket Logic ---
function manageSubscriptions() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const neededSubs = new Set<string>(allCoinsToMonitor.value.filter(coin => coin && coin.trim() !== ''));
  
  neededSubs.forEach(instId => {
    if (instId && !activeSubscriptions.value.has(instId)) {
      ws?.send(JSON.stringify({ op: 'subscribe', instId }));
      activeSubscriptions.value.add(instId);
      if (!livePrices.value[instId]) {
        livePrices.value = { ...livePrices.value, [instId]: '获取中...' };
      }
    }
  });

  activeSubscriptions.value.forEach(instId => {
    if (instId && !neededSubs.has(instId)) {
      ws?.send(JSON.stringify({ op: 'unsubscribe', instId }));
      activeSubscriptions.value.delete(instId);
    }
  });
}

const connectWebSocket = () => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  ws = new WebSocket('ws://localhost:3000');
  isLoadingPriceGlobal.value = true;
  activeSubscriptions.value.clear(); // Clear old subs on new connection

  ws.onopen = () => {
    isLoadingPriceGlobal.value = false;
    console.log('WebSocket 连接已打开');
    manageSubscriptions(); // Initial subscriptions
  };

  ws.onmessage = (event) => {
    try {
      const message: PriceUpdate = JSON.parse(event.data as string);
      if (message.arg?.channel === 'mark-price' && message.data && message.data.length > 0) {
        const priceData = message.data[0];
        if (priceData.instId) { // Ensure instId is present
            livePrices.value = { ...livePrices.value, [priceData.instId]: priceData.markPx };
        }
      } else if (message.event === 'error') {
        console.warn(`价格订阅错误 for ${message.arg?.instId}: ${message.msg}`);
        if (message.arg?.instId && activeSubscriptions.value.has(message.arg.instId)) { 
            livePrices.value = { ...livePrices.value, [message.arg.instId]: '错误' };
        }
      }
    } catch (error) { console.error('处理价格消息错误:', error); }
  };
  ws.onclose = () => { isLoadingPriceGlobal.value = false; console.log('WebSocket 连接已关闭'); };
  ws.onerror = (error) => { isLoadingPriceGlobal.value = false; errorMessage.value = '价格服务连接错误。'; console.error('WS Error:', error);};
};

watch(livePrices,
  (newPrices) => {
    const btcPriceRaw = newPrices['BTC-USDT-SWAP'];
    const ethPriceRaw = newPrices['ETH-USDT-SWAP'];

    const btcPriceDisplay = (btcPriceRaw && !isNaN(parseFloat(btcPriceRaw))) ? parseFloat(btcPriceRaw).toFixed(0) : 'Loading';
    const ethPriceDisplay = (ethPriceRaw && !isNaN(parseFloat(ethPriceRaw))) ? parseFloat(ethPriceRaw).toFixed(0) : '...';

    document.title = `${btcPriceDisplay} ${ethPriceDisplay}`;
  },
  { deep: true }
);

// --- Event Handlers from TradingTerminal ---
const handleSelectedCoinUpdate = (newCoin: string) => {
  if (newCoin && newCoin !== selectedCoinForTrading.value) {
    selectedCoinForTrading.value = newCoin;
    tradeResponseMsg.value = null; // Clear messages when coin changes
    errorMessage.value = null;
    manageSubscriptions(); // Ensure new coin is subscribed
  }
};

interface SubmitOrderPayload {
    coin: string;
    side: 'BUY' | 'SELL';
    sizeBy: 'NOMINALVALUE' | 'QUANTITY';
    value: number;
}

async function handleOrderSubmit(payload: SubmitOrderPayload) { 
  if (isSubmittingOrder.value) return;
  isSubmittingOrder.value = true;
  tradeResponseMsg.value = null; errorMessage.value = null;

  if (!payload.coin || payload.coin.trim() === '') {
      errorMessage.value = "请选择或输入一个有效的交易币种。";
      isSubmittingOrder.value = false; return;
  }
  if (isNaN(payload.value) || payload.value <= 0) {
    errorMessage.value = "请输入有效的交易数量或名义价值。";
    isSubmittingOrder.value = false; return;
  }

  const orderDataForBackend = {
    ...payload,
    leverage: currentLeverageForCalculations.value // Add current leverage
  };

  try {
    const response = await fetch(`${API_BASE_URL}/orders/market`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderDataForBackend) // Use the new object with leverage
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `市价单提交失败: ${response.statusText}`);
    tradeResponseMsg.value = `成功: ${result.message || '订单已提交'} (ID: ${result.orderId})`;
    await fetchAccountData(); 
    await fetchRealizedPnlHistory();
  } catch (error: any) {
    errorMessage.value = error.message || '市价单提交过程中发生错误。';
  } finally {
    isSubmittingOrder.value = false;
  }
}

async function handleClosePosition(coinToClose: string, leverageUsed?: number) { 
  if (isSubmittingOrder.value) return; 
  isSubmittingOrder.value = true; 
  tradeResponseMsg.value = null; errorMessage.value = null;
  
  const bodyParams: { coin: string; leverage?: number } = { coin: coinToClose };
  if (leverageUsed !== undefined && leverageUsed > 0) {
      bodyParams.leverage = leverageUsed;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/positions/close/market`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyParams)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `市价平仓失败: ${response.statusText}`);
    tradeResponseMsg.value = `成功: ${result.message || '平仓指令已提交'} (ID: ${result.orderId})`;
    await fetchAccountData(); 
    await fetchRealizedPnlHistory();
  } catch (error: any) {
    errorMessage.value = error.message || '市价平仓过程中发生错误。';
  } finally {
    isSubmittingOrder.value = false; 
  }
}

const handleLeverageChange = (newLeverage: number) => {
  currentLeverageForCalculations.value = newLeverage;
};

// --- Lifecycle Hooks ---
onMounted(() => {
  if (PRESET_COINS.length > 0 && !selectedCoinForTrading.value) {
    // Initialize selectedCoinForTrading if not already set (e.g. from localStorage in future)
    handleSelectedCoinUpdate(PRESET_COINS[0].value);
  }
  connectWebSocket();
  fetchAccountData();
  fetchRealizedPnlHistory();
  // Subscribe to default coin if any
  if (selectedCoinForTrading.value) {
    manageSubscriptions();
  }
});

watch(allCoinsToMonitor, (newVal, oldVal) => {
    // Basic check to see if the actual set of coins changed
    if (JSON.stringify(newVal.sort()) !== JSON.stringify(oldVal.sort())) {
        manageSubscriptions();
    }
}, { deep: true }); 

</script>

<template>
  <div class="app-container">
    <Header 
      :selectedCoinDisplay="selectedCoinForTrading"
      :currentMarketPriceDisplay="currentMarketPriceForSelectedTradingCoin"
      :livePrices="livePrices"
      :isLoadingPriceGlobal="isLoadingPriceGlobal"
      :globalErrorMessage="errorMessage"
      :globalSuccessMessage="tradeResponseMsg"
      :totalEquityForHeader="totalEquityForHeader"
    />

    <div class="main-layout">
      <TradingTerminal
        :selected-coin="selectedCoinForTrading"
        :current-market-price="currentMarketPriceForSelectedTradingCoin"
        :preset-coins="PRESET_COINS"
        :is-submitting-order="isSubmittingOrder"
        :balance="usdBalance"
        @update:selectedCoin="handleSelectedCoinUpdate"
        @submit-order="handleOrderSubmit"
        @toggle-custom-input-visibility="() => { /* console.log('Custom input visibility toggled') */ }"
        @user-input-change="() => { /* console.log('User input coin changed') */ }"
        @leverage-change="handleLeverageChange"
        class="control-panel-flex-item" 
      />
      
      <AccountInfo 
        :balance="usdBalance"
        :holdings="holdings"
        :livePrices="livePrices"
        :isLoadingAccountData="isLoadingAccountData"
        :isClosingPosition="isSubmittingOrder"
        :currentLeverage="currentLeverageForCalculations"
        @refresh-account-data="fetchAccountData"
        @close-position="handleClosePosition"
        class="account-info-flex-item"
      />
    </div>

    <RealizedPnlHistory
      :pnlHistory="realizedPnlHistory"
      :isLoading="isLoadingRealizedPnl"
      @refresh-pnl="fetchRealizedPnlHistory"
    />

    <Footer />
  </div>
</template>

<style scoped>
.app-container {
  width: 100%; /* Changed from 122% to 100% for better default full-width behavior */
  min-height: 100vh;
  margin: 0 auto;
  padding: 1em; /* Added some padding to app-container */
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  color: #333;
  background-color: #eef1f5;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

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
}
.current-price-display strong {
  color: #f1c40f;
}

.global-error, .global-success {
  padding: 0.8em 1em;
  margin-bottom: 1em;
  border-radius: 4px;
  text-align: center;
}
.global-error {
  background-color: #e74c3c;
  color: white;
}
.global-success {
  background-color: #2ecc71;
  color: white;
}

.main-layout {
  display: flex;
  flex-direction: row;
  gap: 1.5em;
  flex-grow: 1;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 1.5em;
}

.control-panel-flex-item {
  flex: 1; 
  min-width: 350px; /* Adjusted min-width */
}

.account-info-flex-item {
  flex: 1; 
  min-width: 350px; /* Adjusted min-width */
}

.account-info {
  background-color: #ffffff;
  padding: 1.5em;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  flex: 1;
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

.balance-info {
  font-size: 1.1em;
  padding: 0.8em;
  background-color: #e9f5fc;
  border-left: 4px solid #3498db;
  margin-bottom: 1.5em;
  border-radius: 4px;
}
.balance-info strong {
    margin-right: 0.5em;
}

.holdings-table-wrapper {
  overflow-x: auto;
  flex-grow: 1;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
}

thead th {
  background-color: #f0f4f8;
  padding: 0.6em 0.8em;
  text-align: left;
  font-weight: 600;
  color: #4a5568;
  border-bottom: 2px solid #dce4ec;
}

tbody td {
  padding: 0.6em 0.8em;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: middle;
}

tbody tr:last-child td {
  border-bottom: none;
}

tbody tr:hover {
  background-color: #f9fafb;
}

.pnl-positive {
  color: #27ae60;
}
.pnl-negative {
  color: #c0392b;
}

.close-button {
  background-color: #e74c3c;
  min-width: 100px;
}
.close-button:hover:not(:disabled) {
  background-color: #c0392b;
}

.loading-text, .info-text {
  color: #555;
  font-style: italic;
  padding: 1em 0;
  text-align: center;
}

.realized-pnl-history-section {
  background-color: #ffffff;
  padding: 1.5em;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  margin-top: 1.5em;
  display: flex;
  flex-direction: column;
  min-height: 200px;
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
}

.main-column-layout {
    width: 100%;
}

thead th,
tbody td {
  text-align: left;
  vertical-align: middle;
  padding: 0.6em 0.8em;
}

@media (max-width: 900px) {
  .main-layout {
    flex-direction: column; 
  }
  .control-panel-flex-item, .account-info-flex-item {
    width: 100%; 
    flex: none;
    margin-bottom: 1.5em;
  }
  .account-info-flex-item {
      margin-bottom: 0;
  }
}
</style>

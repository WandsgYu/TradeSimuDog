-- 创建 orders 表
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coin VARCHAR(50) NOT NULL,
    order_type VARCHAR(10) NOT NULL CHECK(order_type IN ('BUY', 'SELL')),
    quantity DECIMAL(18,8) NOT NULL,
    price DECIMAL(18,8) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'COMPLETED', 'PARTIALLY_FILLED', 'CANCELLED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- 创建 trades 表
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    coin VARCHAR(50) NOT NULL,
    trade_type VARCHAR(10) NOT NULL CHECK(trade_type IN ('BUY', 'SELL')),
    quantity DECIMAL(18,8) NOT NULL,
    price DECIMAL(18,8) NOT NULL,
    total_amount DECIMAL(18,8) NOT NULL, -- quantity * price
    trade_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 创建 holdings 表
CREATE TABLE IF NOT EXISTS holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coin VARCHAR(50) UNIQUE NOT NULL, -- 每个币种只应有一条持仓记录
    quantity DECIMAL(18,8) NOT NULL DEFAULT 0,
    avg_cost DECIMAL(18,8) NOT NULL DEFAULT 0,
    open_leverage REAL NOT NULL DEFAULT 1, -- 新增：开仓时使用的杠杆，默认为1
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建 balance 表
CREATE TABLE IF NOT EXISTS balance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    currency VARCHAR(50) UNIQUE NOT NULL, -- 每种货币只应有一条余额记录
    amount DECIMAL(18,8) NOT NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 插入初始 USD 余额
INSERT INTO balance (currency, amount)
SELECT 'USD', 100.00
WHERE NOT EXISTS (SELECT 1 FROM balance WHERE currency = 'USD');

-- 为常用查询创建索引可以提高性能
CREATE INDEX IF NOT EXISTS idx_orders_coin_status ON orders (coin, status);
CREATE INDEX IF NOT EXISTS idx_trades_coin_time ON trades (coin, trade_time);
CREATE INDEX IF NOT EXISTS idx_holdings_coin ON holdings (coin);

-- 新增：已实现盈亏记录表
CREATE TABLE IF NOT EXISTS realized_pnl_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coin TEXT NOT NULL,
    initial_direction TEXT NOT NULL CHECK(initial_direction IN ('LONG', 'SHORT')),
    total_quantity_closed REAL NOT NULL,
    avg_entry_price REAL NOT NULL,
    avg_exit_price REAL NOT NULL,
    realized_pnl REAL NOT NULL,
    closed_at DATETIME DEFAULT CURRENT_TIMESTAMP
); 
// server/apiRoutes.js
const express = require('express');
const router = express.Router();
const dbManager = require('./db'); // db.js in the same directory
const { getLatestPrices } = require('./websocketHandler'); // websocketHandler.js

// API 端点
router.get('/price/:coinInstId', (req, res) => {
    const coinInstId = req.params.coinInstId.toUpperCase();
    const prices = getLatestPrices();
    if (prices[coinInstId]) {
        res.json({ coin: coinInstId, price: prices[coinInstId] });
    } else {
        res.status(404).json({ error: '暂无该币种价格信息或币种代码无效', coin: coinInstId });
    }
});

router.get('/balance', (req, res) => {
    dbManager.getUSDBalance((err, balance) => {
        if (err) {
            return res.status(500).json({ error: '获取余额失败' });
        }
        res.json({ currency: 'USD', amount: balance });
    });
});

router.get('/holdings', (req, res) => {
    dbManager.getAllHoldings((err, holdings) => {
        if (err) {
            return res.status(500).json({ error: '获取持仓失败' });
        }
        res.json(holdings);
    });
});

// 市价开仓 API
router.post('/orders/market', async (req, res) => {
    const { coin, side, sizeBy, value, leverage } = req.body;
    const coinInstId = coin.toUpperCase();
    const prices = getLatestPrices();

    if (!coinInstId || !side || !sizeBy || value === undefined || value === null || parseFloat(value) <= 0 || (side.toUpperCase() === 'BUY' && (leverage === undefined || parseFloat(leverage) < 1))) {
        return res.status(400).json({ error: '请求参数无效。' });
    }
    if (!['BUY', 'SELL'].includes(side.toUpperCase())) {
        return res.status(400).json({ error: '无效的 side 参数。' });
    }
    if (!['QUANTITY', 'NOMINALVALUE'].includes(sizeBy.toUpperCase())) {
        return res.status(400).json({ error: '无效的 sizeBy 参数。' });
    }

    const currentMarketPrice = parseFloat(prices[coinInstId]);
    if (isNaN(currentMarketPrice) || currentMarketPrice <= 0) {
        return res.status(400).json({ error: `无法获取 ${coinInstId} 的有效市价。` });
    }

    let quantityToTrade;
    let tradeTotalUSD;

    if (sizeBy.toUpperCase() === 'NOMINALVALUE') {
        tradeTotalUSD = parseFloat(value);
        quantityToTrade = tradeTotalUSD / currentMarketPrice;
    } else {
        quantityToTrade = parseFloat(value);
        tradeTotalUSD = quantityToTrade * currentMarketPrice;
    }

    if (isNaN(quantityToTrade) || quantityToTrade <= 0) {
        return res.status(400).json({ error: '计算出的交易数量无效。' });
    }

    const actualQuantityChange = (side.toUpperCase() === 'BUY') ? quantityToTrade : -quantityToTrade;

    dbManager.db.serialize(() => {
        dbManager.db.run("BEGIN TRANSACTION;");
        dbManager.getUSDBalance((err, currentBalance) => {
            if (err) {
                dbManager.db.run("ROLLBACK;");
                return res.status(500).json({ error: '检查余额失败。' });
            }
            const initialBalance = currentBalance;
            let newUSDBalance;
            let marginRequired = 0;
            const effectiveLeverage = parseFloat(leverage) || 1;

            if (side.toUpperCase() === 'BUY') {
                marginRequired = tradeTotalUSD / effectiveLeverage;
                if (initialBalance < marginRequired) {
                    dbManager.db.run("ROLLBACK;");
                    return res.status(400).json({ error: `USD 余额不足 (开多)。需要保证金: ${marginRequired.toFixed(2)} USD。` });
                }
                newUSDBalance = initialBalance - marginRequired;
            } else { 
                marginRequired = tradeTotalUSD / effectiveLeverage;
                if (initialBalance < marginRequired) {
                    dbManager.db.run("ROLLBACK;");
                    return res.status(400).json({ error: `USD 余额不足 (开空)。需要保证金: ${marginRequired.toFixed(2)} USD。` });
                }
                newUSDBalance = initialBalance - marginRequired; 
            }

            dbManager.updateUSDBalance(newUSDBalance, (err_bal) => {
                if (err_bal) {
                    dbManager.db.run("ROLLBACK;");
                    return res.status(500).json({ error: '更新余额失败。' });
                }
                dbManager.updateHolding(coinInstId, actualQuantityChange, currentMarketPrice, effectiveLeverage, (err_holding) => {
                    if (err_holding) {
                        dbManager.db.run("ROLLBACK;");
                        return res.status(500).json({ error: '更新持仓失败。' });
                    }
                    const orderSql = `INSERT INTO orders (coin, order_type, quantity, price, status, completed_at) VALUES (?, ?, ?, ?, 'COMPLETED', CURRENT_TIMESTAMP)`;
                    dbManager.db.run(orderSql, [coinInstId, side.toUpperCase(), quantityToTrade, currentMarketPrice], function(err_order) {
                        if (err_order) {
                            dbManager.db.run("ROLLBACK;");
                            return res.status(500).json({ error: '创建订单记录失败。' });
                        }
                        const orderId = this.lastID;
                        const tradeSql = `INSERT INTO trades (order_id, coin, trade_type, quantity, price, total_amount, trade_time) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
                        dbManager.db.run(tradeSql, [orderId, coinInstId, side.toUpperCase(), quantityToTrade, currentMarketPrice, tradeTotalUSD], (err_trade) => {
                            if (err_trade) {
                                dbManager.db.run("ROLLBACK;");
                                return res.status(500).json({ error: '创建交易记录失败。' });
                            }
                            dbManager.db.run("COMMIT;");
                            res.status(201).json({ 
                                message: '市价单执行成功。', orderId: orderId, coin: coinInstId, side: side.toUpperCase(), 
                                quantityTraded: quantityToTrade, price: currentMarketPrice, totalUSD: tradeTotalUSD,
                                leverageUsed: effectiveLeverage
                            });
                        });
                    });
                });
            });
        });
    });
});

// 市价平仓 API
router.post('/positions/close/market', async (req, res) => {
    const { coin, leverage } = req.body;
    const coinInstId = coin.toUpperCase();
    const prices = getLatestPrices();

    if (!coinInstId) return res.status(400).json({ error: '请求参数无效。请提供 coin。' });
    if (leverage !== undefined && (isNaN(parseFloat(leverage)) || parseFloat(leverage) <= 0)) {
        return res.status(400).json({ error: '提供的杠杆参数无效。' });
    }

    const currentMarketPrice = parseFloat(prices[coinInstId]);
    if (isNaN(currentMarketPrice) || currentMarketPrice <= 0) {
        return res.status(400).json({ error: `无法获取 ${coinInstId} 的有效市价。` });
    }

    dbManager.db.serialize(() => {
        dbManager.db.run("BEGIN TRANSACTION;");
        dbManager.getHolding(coinInstId, (err, holding) => {
            if (err) {
                dbManager.db.run("ROLLBACK;");
                return res.status(500).json({ error: '查询持仓失败。' });
            }
            if (!holding || parseFloat(holding.quantity) === 0) {
                dbManager.db.run("ROLLBACK;");
                return res.status(400).json({ error: `没有 ${coinInstId} 的持仓可平。` });
            }

            const originalQuantity = parseFloat(holding.quantity);
            const originalAvgCost = parseFloat(holding.avg_cost);
            const sideToClose = originalQuantity > 0 ? 'SELL' : 'BUY';
            const absQuantityToClose = Math.abs(originalQuantity);
            const tradeTotalUSD = absQuantityToClose * currentMarketPrice;
            const nominalValueAtEntry = absQuantityToClose * originalAvgCost;
            const initialDirection = originalQuantity > 0 ? 'LONG' : 'SHORT';

            dbManager.getUSDBalance((err_bal, currentBalance) => {
                if (err_bal) {
                    dbManager.db.run("ROLLBACK;");
                    return res.status(500).json({ error: '检查余额失败(平仓)。' });
                }
                const initialBalanceForClose = currentBalance;
                let newUSDBalance;
                const realizedPnlForPosition = (initialDirection === 'LONG') 
                    ? (currentMarketPrice - originalAvgCost) * absQuantityToClose 
                    : (originalAvgCost - currentMarketPrice) * absQuantityToClose;

                const effectiveLeverage = parseFloat(leverage) || 1;
                const marginToReturn = nominalValueAtEntry / effectiveLeverage;

                if (sideToClose === 'SELL') { 
                    newUSDBalance = initialBalanceForClose + marginToReturn + realizedPnlForPosition;
                } else { 
                    newUSDBalance = initialBalanceForClose + marginToReturn + realizedPnlForPosition;
                }

                dbManager.updateUSDBalance(newUSDBalance, (err_upd_bal) => {
                    if (err_upd_bal) {
                        dbManager.db.run("ROLLBACK;");
                        return res.status(500).json({ error: '更新余额失败(平仓)。' });
                    }
                    const orderSql = `INSERT INTO orders (coin, order_type, quantity, price, status, completed_at) VALUES (?, ?, ?, ?, 'COMPLETED', CURRENT_TIMESTAMP)`;
                    dbManager.db.run(orderSql, [coinInstId, sideToClose, absQuantityToClose, currentMarketPrice], function(err_order) {
                        if (err_order) {
                            dbManager.db.run("ROLLBACK;");
                            return res.status(500).json({ error: '创建平仓订单记录失败。' });
                        }
                        const orderId = this.lastID;
                        const tradeSql = `INSERT INTO trades (order_id, coin, trade_type, quantity, price, total_amount, trade_time) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
                        dbManager.db.run(tradeSql, [orderId, coinInstId, sideToClose, absQuantityToClose, currentMarketPrice, tradeTotalUSD], (err_trade) => {
                            if (err_trade) {
                                dbManager.db.run("ROLLBACK;");
                                return res.status(500).json({ error: '创建平仓交易记录失败。' });
                            }
                            const pnlLogSql = `INSERT INTO realized_pnl_log (coin, initial_direction, total_quantity_closed, avg_entry_price, avg_exit_price, realized_pnl) VALUES (?, ?, ?, ?, ?, ?)`;
                            dbManager.db.run(pnlLogSql, [coinInstId, initialDirection, absQuantityToClose, originalAvgCost, currentMarketPrice, realizedPnlForPosition], (err_pnl) => {
                                if (err_pnl) {
                                    dbManager.db.run("ROLLBACK;");
                                    return res.status(500).json({ error: '记录已实现盈亏失败。' });
                                }
                                dbManager.updateHolding(coinInstId, -originalQuantity, currentMarketPrice, null, (err_holding) => {
                                    if (err_holding) {
                                        dbManager.db.run("ROLLBACK;");
                                        return res.status(500).json({ error: '更新持仓失败(平仓).' });
                                    }
                                    dbManager.db.run("COMMIT;");
                                    res.status(200).json({ 
                                        message: '市价平仓成功。', orderId: orderId, coin: coinInstId, closedSide: sideToClose, 
                                        quantityClosed: absQuantityToClose, price: currentMarketPrice, totalUSD: tradeTotalUSD,
                                        realizedPnl: realizedPnlForPosition
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

router.get('/trades/history', (req, res) => {
    const sql = "SELECT id, order_id, coin, trade_type, quantity, price, total_amount, trade_time FROM trades ORDER BY trade_time DESC";
    dbManager.db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('查询交易历史失败:', err.message);
            return res.status(500).json({ error: '获取交易历史失败' });
        }
        res.json(rows);
    });
});

router.get('/pnl/history', (req, res) => {
    const sql = "SELECT id, coin, initial_direction, total_quantity_closed, avg_entry_price, avg_exit_price, realized_pnl, closed_at FROM realized_pnl_log ORDER BY closed_at DESC";
    dbManager.db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('查询已实现盈亏历史失败:', err.message);
            return res.status(500).json({ error: '获取已实现盈亏历史失败' });
        }
        res.json(rows);
    });
});

module.exports = router; 
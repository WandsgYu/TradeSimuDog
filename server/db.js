// server/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = 'E:\\SQLite'; // 数据库文件目录
const dbPath = path.join(dbDir, 'mycoin.db');

// 确保数据库目录存在
if (!fs.existsSync(dbDir)) {
    try {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`数据库目录 ${dbDir} 已创建。`);
    } catch (err) {
        console.error(`创建数据库目录 ${dbDir} 失败:`, err);
        process.exit(1);
    }
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('连接数据库失败:', err.message);
        process.exit(1);
    } else {
        console.log('已连接到 SQLite 数据库.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    const sqlScriptPath = path.join(__dirname, 'database_init.sql');
    fs.readFile(sqlScriptPath, 'utf8', (err, sqlScript) => {
        if (err) {
            console.error('读取数据库初始化脚本失败:', err);
            return;
        }
        db.exec(sqlScript, (err) => {
            if (err) {
                console.error('执行数据库初始化脚本失败:', err.message);
            } else {
                console.log('数据库初始化成功或已初始化。');
            }
        });
    });
}

function getUSDBalance(callback) {
    db.get("SELECT amount FROM balance WHERE currency = 'USD'", [], (err, row) => {
        if (err) return callback(err, null);
        callback(null, row ? row.amount : 0);
    });
}

function updateUSDBalance(newAmount, callback) {
    db.run("UPDATE balance SET amount = ?, last_updated = CURRENT_TIMESTAMP WHERE currency = 'USD'", [newAmount], function(err) {
        callback(err, this.changes);
    });
}

function getAllHoldings(callback) { // Primarily used by apiRoutes, but good to keep DB functions together
    db.all("SELECT coin, quantity, avg_cost, open_leverage FROM holdings WHERE quantity != 0 ORDER BY coin", [], (err, rows) => {
        if (err) return callback(err, null);
        callback(null, rows);
    });
}

function getHolding(coin, callback) {
    db.get("SELECT id, quantity, avg_cost, open_leverage FROM holdings WHERE coin = ?", [coin], (err, row) => {
        if (err) return callback(err);
        callback(null, row);
    });
}

function updateHolding(coin, quantityChange, tradePrice, newOpenLeverage, callback) {
    db.get("SELECT id, quantity, avg_cost, open_leverage FROM holdings WHERE coin = ?", [coin], (err, holding) => {
        if (err) return callback(err);

        let newQuantity;
        let newAvgCost;
        let finalOpenLeverageToSave;

        if (holding) {
            newQuantity = parseFloat(holding.quantity) + parseFloat(quantityChange);
            
            const isOpeningOrIncreasingPosition = 
                (parseFloat(holding.quantity) === 0 && parseFloat(quantityChange) !== 0) ||
                (parseFloat(holding.quantity) > 0 && parseFloat(quantityChange) > 0) ||
                (parseFloat(holding.quantity) < 0 && parseFloat(quantityChange) < 0);

            if (isOpeningOrIncreasingPosition && newOpenLeverage !== null && newOpenLeverage !== undefined) {
                finalOpenLeverageToSave = newOpenLeverage;
            } else {
                finalOpenLeverageToSave = holding.open_leverage; 
            }
            
            if (Math.abs(newQuantity) < 0.00000001) { 
                newQuantity = 0;
                newAvgCost = 0;
                finalOpenLeverageToSave = holding.open_leverage; 
            } else if (parseFloat(quantityChange) > 0 && parseFloat(holding.quantity) >= 0) {
                newAvgCost = ((parseFloat(holding.avg_cost) * parseFloat(holding.quantity)) + (parseFloat(tradePrice) * parseFloat(quantityChange))) / newQuantity;
            } else if (parseFloat(quantityChange) < 0 && parseFloat(holding.quantity) > 0) {
                newAvgCost = holding.avg_cost;
            } else if (parseFloat(quantityChange) < 0 && parseFloat(holding.quantity) <= 0) {
                newAvgCost = ((parseFloat(holding.avg_cost) * Math.abs(parseFloat(holding.quantity))) + (parseFloat(tradePrice) * Math.abs(parseFloat(quantityChange)))) / Math.abs(newQuantity);
            } else if (parseFloat(quantityChange) > 0 && parseFloat(holding.quantity) < 0) {
                newAvgCost = holding.avg_cost;
            } else { 
                newAvgCost = tradePrice;
                if (newOpenLeverage !== null && newOpenLeverage !== undefined) {
                    finalOpenLeverageToSave = newOpenLeverage;
                }
            }
            db.run("UPDATE holdings SET quantity = ?, avg_cost = ?, open_leverage = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?", 
                   [newQuantity, newAvgCost, finalOpenLeverageToSave, holding.id], callback);
        } else { 
            newQuantity = parseFloat(quantityChange);
            newAvgCost = parseFloat(tradePrice);
            finalOpenLeverageToSave = newOpenLeverage || 1; 
            db.run("INSERT INTO holdings (coin, quantity, avg_cost, open_leverage, last_updated) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)", 
                   [coin, newQuantity, newAvgCost, finalOpenLeverageToSave], callback);
        }
    });
}

module.exports = {
    db,
    initializeDatabase, // Though it's called internally on connect, can be exported if needed elsewhere
    getUSDBalance,
    updateUSDBalance,
    getAllHoldings,
    getHolding,
    updateHolding
}; 
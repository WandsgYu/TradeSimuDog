const WebSocket = require('ws');

let latestPrices = {}; // { "BTC-USDT-SWAP": "60000.50", ... }

function initializeWebSocketHandler(wss) { // wss is the WebSocket.Server instance from server.js
    wss.on('connection', function connection(wsClient) {
        console.log('新的客户端连接');
        const activeOkxSubscriptions = new Set();
        let okxWs = null;

        function connectToOkx() {
            if (okxWs && (okxWs.readyState === WebSocket.OPEN || okxWs.readyState === WebSocket.CONNECTING)) {
                console.log('OKX WebSocket 已连接或正在连接中。');
                if (okxWs.readyState === WebSocket.OPEN) {
                    activeOkxSubscriptions.forEach(instId => {
                        const subMsg = JSON.stringify({ op: 'subscribe', args: [{ channel: 'mark-price', instId }] });
                        okxWs.send(subMsg);
                    });
                }
                return;
            }

            okxWs = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');

            okxWs.on('open', () => {
                console.log('已连接到OKX WebSocket');
                activeOkxSubscriptions.forEach(instId => {
                    const subMsg = JSON.stringify({ op: 'subscribe', args: [{ channel: 'mark-price', instId }] });
                    okxWs.send(subMsg);
                });
            });

            okxWs.on('message', (data) => {
                const messageString = data.toString();
                try {
                    const parsedMessage = JSON.parse(messageString);
                    if (parsedMessage.arg && parsedMessage.arg.channel === 'mark-price' && parsedMessage.data && parsedMessage.data.length > 0) {
                        const priceData = parsedMessage.data[0];
                        latestPrices[priceData.instId] = priceData.markPx;
                    }
                    if (parsedMessage.event === 'subscribe') {
                        // console.log(`OKX确认订阅: ${parsedMessage.arg.instId}`);
                    } else if (parsedMessage.event === 'unsubscribe') {
                        // console.log(`OKX确认取消订阅: ${parsedMessage.arg.instId}`);
                    } else if (parsedMessage.event === 'error') {
                        console.error(`OKX WebSocket 错误: ${parsedMessage.msg}`, parsedMessage);
                    }
                    if (wsClient.readyState === WebSocket.OPEN) {
                        wsClient.send(messageString);
                    }
                } catch (e) {
                    console.error('解析或处理OKX消息错误:', e);
                    if (wsClient.readyState === WebSocket.OPEN) {
                        wsClient.send(messageString);
                    }
                }
            });

            okxWs.on('error', (error) => {
                console.error('OKX WebSocket连接错误:', error.message);
            });

            okxWs.on('close', (code, reason) => {
                console.log(`OKX WebSocket 连接已关闭. Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}`);
                activeOkxSubscriptions.forEach(instId => {
                    delete latestPrices[instId];
                });
                okxWs = null;
            });
        }

        connectToOkx();

        wsClient.on('message', (message) => {
            try {
                const clientMessage = JSON.parse(message.toString());
                if (clientMessage.op && clientMessage.instId) {
                    const instId = clientMessage.instId.toUpperCase();
                    let operationArgs = [{ channel: 'mark-price', instId }];

                    if (clientMessage.op === 'subscribe') {
                        if (!activeOkxSubscriptions.has(instId)) {
                            activeOkxSubscriptions.add(instId);
                            if (okxWs && okxWs.readyState === WebSocket.OPEN) {
                                const subMsg = JSON.stringify({ op: 'subscribe', args: operationArgs });
                                okxWs.send(subMsg);
                            } else {
                                connectToOkx();
                            }
                        } 
                    } else if (clientMessage.op === 'unsubscribe') {
                        if (activeOkxSubscriptions.has(instId)) {
                            activeOkxSubscriptions.delete(instId);
                            delete latestPrices[instId];
                            if (okxWs && okxWs.readyState === WebSocket.OPEN) {
                                const unsubMsg = JSON.stringify({ op: 'unsubscribe', args: operationArgs });
                                okxWs.send(unsubMsg);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('处理客户端消息错误:', e);
                if (wsClient.readyState === WebSocket.OPEN) {
                    wsClient.send(JSON.stringify({ error: '无效的消息格式' }));
                }
            }
        });

        wsClient.on('close', () => {
            console.log(`客户端 ${wsClient._socket.remoteAddress} 断开连接`);
            if (okxWs) {
                activeOkxSubscriptions.forEach(instId => {
                    if (okxWs.readyState === WebSocket.OPEN) {
                        const unsubMsg = JSON.stringify({ op: 'unsubscribe', args: [{ channel: 'mark-price', instId }] });
                        okxWs.send(unsubMsg);
                    }
                    delete latestPrices[instId];
                });
                activeOkxSubscriptions.clear();
                okxWs.close();
                okxWs = null;
            }
        });

        wsClient.on('error', (error) => {
            console.error(`客户端 ${wsClient._socket.remoteAddress} WebSocket 错误:`, error);
        });
    });
}

module.exports = {
    initializeWebSocketHandler,
    getLatestPrices: () => latestPrices // Function to access the latestPrices object
}; 
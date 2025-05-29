const express = require('express');
const http = require('http'); // Renamed from 'server' which was confusing
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path'); // path is used by db.js, but good to keep it here if server.js itself needs it later

// Import modules
const dbManager = require('./db'); // dbManager.db for direct access, or dbManager.initializeDatabase() etc.
const apiRoutes = require('./apiRoutes');
const { initializeWebSocketHandler } = require('./websocketHandler');

const app = express();

// --- Middlewares ---
app.use(cors());
app.use(express.json());
// --- Middlewares End ---

// --- API Routes ---
app.use('/api', apiRoutes); // Mount all API routes under /api
// --- API Routes End ---

const serverInstance = http.createServer(app); // Use a different name for the http server instance
const wss = new WebSocket.Server({ server: serverInstance });

// Initialize WebSocket Handler
initializeWebSocketHandler(wss);

// Static files (if any, e.g. a build of a frontend if not served by Vite dev server)
// app.use(express.static('public'));
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

const PORT = process.env.PORT || 3000;
serverInstance.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    // Note: Database initialization is handled within db.js upon connection
}); 
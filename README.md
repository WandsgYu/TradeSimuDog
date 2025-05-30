# TradeSimuDog —— 爆仓赌狗の自救训练基地

**(又名：《从入门到破产再到入门》官方指定练习场)**

---

## 🚀 项目灵魂拷问 (Project Soul-Searching)

**为什么开发这个？ (Why was this created?)**

因为爆仓很多次，痛定思痛决定用代码治愈赌狗脑 ——
用模拟盘亏光，让实盘少亏真金白银！

*Because my liquidations outnumbered my first loves, I decided to cure my gambling brain with code — lose all virtual currency in simulation, so I lose less real money in live trading!*

**核心功能是什么？ (What are the core features?)**

模拟爆仓模拟器（划掉）
正经版： 策略炼蛊 + 亏光不心疼的虚拟交易

*Liquidation Simulator (crossed out)*
*Serious version: Strategy Experimentation + Virtual trading where losses don't hurt your wallet.*

**适合谁用？ (Who is this for?)**

✅ 合约新手：先在这亏完 100 次再去实盘
   *(✅ Contract Novices: Lose 100 times here before going live.)*

✅ 资深赌狗：验证玄学策略（比如看 K 线时放《好运来》是否能提高胜率）
   *(✅ Seasoned Gamblers: Test your superstitious strategies (e.g., does playing "Good Luck Comes" while looking at K-lines improve win rates?))*

❌ 想一夜暴富的人：建议直接去天台排队
   *(❌ People dreaming of getting rich overnight: We suggest you go queue up on the rooftop.)*

---

## 🎮 快速上车指南 (Quick Start Guide)

1.  **克隆项目 (Clone the project)**
    ```bash
    git clone https://github.com/WandsgYu/TradeSimuDog.git
    cd TradeSimuDog-main
    ```

2.  **依赖安装与服务启动 (Dependency Installation & Starting Services)**
    *   **后端 (Backend):**
        ```bash
        cd server      # 进入后端目录
        npm install  # 安装后端依赖 (Install backend dependencies)
        npm run dev # 启动后端服务 (Start backend service)
        ```
        *(注意: 后端服务依赖其自身的 `package.json`。请确保在此目录下执行 `npm install`。)*
        *(Note: The backend service depends on its own `package.json`. Ensure you run `npm install` in this directory.)*
        *(另外，请确保 E:\SQLite 目录存在或按需修改 `server/db.js` 和 `server/server.js` 中的数据库路径配置)*
        *(Also, ensure the E:\SQLite directory exists or modify the database path configuration in `server/db.js` and `server/server.js` as needed)*

    *   **前端 (Frontend):**
        ```bash
        cd front       # 进入前端目录
        npm install  # 安装前端依赖 (Install frontend dependencies)
        npm run dev    # 启动前端开发服务器 (Start frontend development server)
        ```
        *(注意: 前端服务依赖其自身的 `package.json`。请确保在此目录下执行 `npm install`。)*
        *(Note: The frontend service depends on its own `package.json`. Ensure you run `npm install` in this directory.)*

3.  **访问前端 (Access the frontend)**
    打开浏览器并访问 `http://localhost:5173` (或其他 Vite 启动时提示的地址)。
    *Open your browser and navigate to `http://localhost:5173` (or the address shown when Vite starts).*

---

## 📢 赌狗宣言（严肃版）(Gambler's Manifesto - Serious Version)

**警告：本工具仅供学习交流，请勿用于真实交易！**
**WARNING: This tool is for learning and communication purposes only. Do NOT use it for real trading!**

*   模拟亏损不代表实盘不会亏更多
    *(Simulated losses do not guarantee you won't lose more in live trading.)*
*   代码能修复策略，但治不了赌性
    *(Code can fix strategies, but it can't cure a gambling addiction.)*
*   投资有风险，入市需戒赌
    *(Investment is risky; enter the market with caution and quit gambling.)*

---

最后送大家一句忠告：
*A final piece of advice for everyone:*

**合约毁一生，现货穷三代**
*(Contracts ruin one life, spot trading impoverishes three generations.)*

**若想财富自由，不如进厂打螺丝**
*(If you want financial freedom, you might as well work in a factory screwing screws.)*

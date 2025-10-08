import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors({
  origin: ["https://auratrade.fun"],
  methods: ["GET", "POST"]
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://auratrade.fun"],
    methods: ["GET", "POST"]
  }
});

// 🧠 Your QuickNode RPC endpoint
const RPC_URL = "https://green-cosmopolitan-patina.solana-mainnet.quiknode.pro/aabe546d992ca75cc13fa9e855334094785a9b98/";

// ⚙️ Helper: check transaction status quickly
async function checkTxStatus(txHash) {
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[txHash], { searchTransactionHistory: true }]
      })
    });

    const data = await response.json();
    const status = data?.result?.value?.[0];

    if (!status) return "pending";
    if (status.err) return "failed";
    if (status.confirmations === null || status.confirmationStatus === "finalized")
      return "verified";
    return "pending";
  } catch (e) {
    console.error("❌ Error checking TX:", e.message);
    return "failed";
  }
}

// 🚀 Socket.io real-time events
io.on("connection", (socket) => {
  console.log("✅ New client connected:", socket.id);

  // 💬 Live chat messages
  socket.on("message", (msg) => {
    console.log("💬 Message:", msg);
    io.emit("message", msg);
  });

  // 💸 Transaction verification
  socket.on("verifyTx", async ({ txHash, orderId, userId }) => {
    console.log("🔍 Checking TX:", txHash);
    io.emit("txStatus", { txHash, status: "pending" });

    // Fast polling (every 2s, up to 8 tries)
    for (let i = 0; i < 8; i++) {
      const status = await checkTxStatus(txHash);
      console.log(`⚡ TX ${txHash} → ${status}`);
      io.emit("txStatus", { txHash, status });

      if (status === "verified" || status === "failed") return;
      await new Promise(r => setTimeout(r, 2000));
    }

    // if still not confirmed after 8 tries
    io.emit("txStatus", { txHash, status: "timeout" });
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("AuraTrade WebSocket server is running ✅");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

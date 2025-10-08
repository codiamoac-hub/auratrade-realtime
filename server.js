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

// ✅ QuickNode RPC
const RPC_URL = "https://green-cosmopolitan-patina.solana-mainnet.quiknode.pro/aabe546d992ca75cc13fa9e855334094785a9b98";

async function checkTxStatus(txHash) {
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[txHash]]
      })
    });
    const json = await res.json();
    const status = json.result?.value?.[0];
    if (!status) return "pending";
    if (status.err) return "failed";
    if (status.confirmationStatus === "finalized") return "verified";
    return "pending";
  } catch (e) {
    console.error("RPC Error:", e);
    return "failed";
  }
}

io.on("connection", (socket) => {
  console.log("✅ Client connected:", socket.id);

  // 🔹 Realtime CHAT
  socket.on("message", (msg) => {
    console.log("💬 Message received:", msg);
    io.emit("message", msg);        // broadcast to all clients
  });

  // 🔹 Realtime TX Verification
  socket.on("verifyTx", async ({ txHash, orderId, userId }) => {
    console.log("🔍 Checking TX:", txHash);
    io.emit("txStatus", { txHash, status: "pending" });

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const status = await checkTxStatus(txHash);
      console.log(`🧩 TX ${txHash} → ${status}`);
      io.emit("txStatus", { txHash, status });

      if (status === "verified" || status === "failed" || attempts > 10) {
        clearInterval(interval);
      }
    }, 6000);
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("AuraTrade Realtime Server ✅");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

import express from "express";
import http from "http";
import { Server } from "socket.io";
import fetch from "node-fetch";

const app = express();
const server = http.createServer(app);

// =======================
//  SOCKET.IO SETUP
// =======================
const io = new Server(server, {
  cors: {
    origin: ["https://auratrade.fun"], // ton site live
    methods: ["GET", "POST"],
  },
  transports: ["websocket"], // websocket only
  pingInterval: 10000, // keeps connection alive
  pingTimeout: 5000,
});

// =======================
//  (OPTIONAL) SOLANA TX CHECK
// =======================
const RPC_URL =
  "https://green-cosmopolitan-patina.solana-mainnet.quiknode.pro/aabe546d992ca75cc13fa9e855334094785a9b98/";

async function checkTxStatus(txHash) {
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[txHash], { searchTransactionHistory: true }],
      }),
    });

    const data = await response.json();
    const status = data?.result?.value?.[0];
    if (!status) return "pending";
    if (status.err) return "failed";
    if (status.confirmationStatus === "finalized") return "verified";
    return "pending";
  } catch (err) {
    console.error("RPC Error:", err.message);
    return "failed";
  }
}

// =======================
//  SOCKET EVENTS
// =======================
io.on("connection", (socket) => {
  console.log("🟢 Client connecté:", socket.id);

  // all users join same room
  socket.join("auratrade-chat");

  // Realtime chat
  socket.on("message", (data) => {
    console.log("💬 Nouveau message:", data);
    io.to("auratrade-chat").emit("message", data);
  });

  // Tx verification (optional)
  socket.on("verifyTx", async ({ txHash, userId }) => {
    io.emit("txStatus", { txHash, status: "pending" });
    for (let i = 0; i < 8; i++) {
      const status = await checkTxStatus(txHash);
      io.emit("txStatus", { txHash, status });
      if (status === "verified" || status === "failed") return;
      await new Promise((r) => setTimeout(r, 3000));
    }
    io.emit("txStatus", { txHash, status: "timeout" });
  });

  socket.on("disconnect", () => {
    console.log("🔴 Client déconnecté:", socket.id);
  });
});

// simple test route
app.get("/", (req, res) => {
  res.send("AuraTrade WebSocket server is running ✅");
});

// Render auto port
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));

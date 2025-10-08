import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fetch from "node-fetch"; // Needed for RPC calls

const app = express();
app.use(cors({
  origin: ["https://auratrade.fun"], // your frontend domain
  methods: ["GET", "POST"]
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://auratrade.fun"],
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("✅ New client connected:", socket.id);

  // 💬 Chat system stays the same
  socket.on("message", (msg) => {
    console.log("💬 Message received:", msg);
    io.emit("message", msg);
  });

  // 💰 Solana transaction verification
  socket.on("verifyTx", async (txHash) => {
    console.log("🔍 Checking transaction:", txHash);
    io.emit("txStatus", { hash: txHash, status: "pending" });

    try {
      const response = await fetch("https://green-cosmopolitan-patina.solana-mainnet.quiknode.pro/aabe546d992ca75cc13fa9e855334094785a9b98", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [txHash, { commitment: "confirmed" }]
        })
      });

      const data = await response.json();

      if (data.result) {
        console.log("✅ Transaction verified:", txHash);
        io.emit("txStatus", { hash: txHash, status: "verified" });
      } else {
        console.log("⏳ Transaction not yet confirmed:", txHash);
        io.emit("txStatus", { hash: txHash, status: "not_found" });
      }
    } catch (error) {
      console.error("❌ Error verifying transaction:", error);
      io.emit("txStatus", { hash: txHash, status: "error" });
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("AuraTrade WebSocket + TX verification server is running ✅");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

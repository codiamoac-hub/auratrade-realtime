import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import pkg from "pg"; // 👈 Postgres client
const { Client } = pkg;
import { createClient } from "@supabase/supabase-js";

// ⚙️ Supabase setup
const SUPABASE_URL = "https://sdknfiufozodqhwhslaa.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNka25maXVmb3pvZHFod2hzbGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNTAyNzMsImV4cCI6MjA3NDgyNjI3M30.EhsCvTUmZwBq4VFTCp0cCkTkLZUAiW4t88vcLLn5684"; // secure in env vars
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 🪙 Solana RPC
const RPC_URL = "https://green-cosmopolitan-patina.solana-mainnet.quiknode.pro/aabe546d992ca75cc13fa9e855334094785a9b98";

// ⚙️ Postgres listener setup
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL || "YOUR_SUPABASE_DB_CONNECTION_STRING",
  ssl: { rejectUnauthorized: false },
});
await pgClient.connect();

// Express + Socket setup
const app = express();
app.use(
  cors({
    origin: ["https://auratrade.fun"],
    methods: ["GET", "POST"],
  })
);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://auratrade.fun"],
    methods: ["GET", "POST"],
  },
});

// ================================================
// 💬 CHAT SYSTEM (unchanged)
// ================================================
io.on("connection", (socket) => {
  console.log("✅ Client connected:", socket.id);

  socket.on("message", (msg) => {
    console.log("💬 Message:", msg);
    io.emit("message", msg);
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
  });
});

// ================================================
// 🧠 LISTEN TO TRANSACTION CHANGES IN POSTGRES
// ================================================
await pgClient.query("LISTEN transactions_changes");

pgClient.on("notification", async (msg) => {
  const tx = JSON.parse(msg.payload);
  console.log("📡 PG_NOTIFY event:", tx);

  // Step 1: Broadcast to all connected clients
  io.emit("transactionUpdate", tx);

  // Step 2: Verify on-chain if pending
  if (tx.status === "pending" && tx.tx_hash) {
    verifySolanaTx(tx);
  }
});

// ================================================
// 💸 Solana verification
// ================================================
async function verifySolanaTx(tx) {
  console.log(`🔍 Checking Solana TX: ${tx.tx_hash}`);
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[tx.tx_hash], { searchTransactionHistory: true }],
      }),
    });

    const data = await res.json();
    const status = data?.result?.value?.[0];
    let finalStatus = "pending";

    if (status?.confirmationStatus === "finalized") finalStatus = "verified";
    else if (status === null) finalStatus = "failed";

    if (finalStatus !== tx.status) {
      await supabase
        .from("transactions")
        .update({ status: finalStatus })
        .eq("tx_hash", tx.tx_hash);

      io.emit("transactionUpdate", { ...tx, status: finalStatus });
      console.log(`✅ TX ${tx.tx_hash} updated → ${finalStatus}`);
    }
  } catch (err) {
    console.error("❌ Error verifying TX:", err.message);
  }
}

// ================================================
// 🩺 Health check
// ================================================
app.get("/", (req, res) => {
  res.send("✅ AuraTrade Realtime server running with pg_notify + Solana RPC");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));

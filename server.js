import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

// ===================================================
// ⚙️ SUPABASE SETUP
// ===================================================
const supabase = createClient(
  "https://sdknfiufozodqhwhslaa.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNka25maXVmb3pvZHFod2hzbGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNTAyNzMsImV4cCI6MjA3NDgyNjI3M30.EhsCvTUmZwBq4VFTCp0cCkTkLZUAiW4t88vcLLn5684"
);

// ===================================================
// 🪙 SOLANA RPC CONFIG
// ===================================================
const RPC_URL =
  "https://green-cosmopolitan-patina.solana-mainnet.quiknode.pro/aabe546d992ca75cc13fa9e855334094785a9b98";

// ===================================================
// 🚀 EXPRESS + SOCKET.IO INIT
// ===================================================
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

// ===================================================
// 💬 CHAT SYSTEM
// ===================================================
io.on("connection", (socket) => {
  console.log("✅ Client connected:", socket.id);

  // Normal chat
  socket.on("message", (msg) => {
    console.log("💬 Message:", msg);
    io.emit("message", msg);
  });

  // Admin joins room
  socket.on("joinAdmin", () => {
    socket.join("admins");
    console.log("👑 Admin joined:", socket.id);
  });

  // Transaction submitted from frontend
  socket.on("transactionSubmitted", async (txData) => {
    console.log("💸 TX submitted:", txData);

    try {
      const { data, error } = await supabase
        .from("transactions")
        .insert([txData])
        .select("*");

      if (error) throw error;
      const tx = data[0];

      io.emit("transactionUpdate", tx); // broadcast to everyone
      io.to("admins").emit("adminTxUpdate", tx);
    } catch (err) {
      console.error("❌ Error saving TX:", err.message);
    }
  });

  // Admin verifying or rejecting transaction
  socket.on("verifyTransaction", async ({ tx_hash, status, verified_by }) => {
    console.log(`🔍 Admin verified TX ${tx_hash} → ${status}`);

    try {
      const { data, error } = await supabase
        .from("transactions")
        .update({ status, verified_by })
        .eq("tx_hash", tx_hash)
        .select("*");

      if (error) throw error;
      const tx = data[0];

      io.emit("transactionUpdate", tx);
      io.to("admins").emit("adminTxVerified", tx);
      console.log(`✅ TX ${tx_hash} updated to ${status}`);
    } catch (err) {
      console.error("❌ Error verifying TX:", err.message);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// ===================================================
// 🔁 SUPABASE REALTIME LISTENER
// ===================================================
supabase
  .channel("transactions-realtime")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "transactions" },
    async (payload) => {
      const tx = payload.new;
      if (!tx) return;

      console.log("📡 Realtime TX update:", tx);
      io.emit("transactionUpdate", tx);
      io.to("admins").emit("adminTxUpdate", tx);

      // Trigger Solana verification if pending
      if (tx.status === "pending" && tx.tx_hash) {
        verifySolanaTx(tx);
      }
    }
  )
  .subscribe((status) => {
    console.log("🟢 Supabase Realtime Status:", status);
  });

// ===================================================
// 🧠 SOLANA TX VERIFIER
// ===================================================
async function verifySolanaTx(tx) {
  console.log(`🔍 Checking Solana TX: ${tx.tx_hash}`);
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[tx.tx_hash], { searchTransactionHistory: true }],
      }),
    });

    const data = await response.json();
    const status = data?.result?.value?.[0];

    let finalStatus = "pending";
    if (status?.confirmationStatus === "finalized") finalStatus = "verified";
    else if (status === null) finalStatus = "failed";

    if (finalStatus !== "pending") {
      await supabase
        .from("transactions")
        .update({ status: finalStatus })
        .eq("tx_hash", tx.tx_hash);

      io.emit("transactionUpdate", { ...tx, status: finalStatus });
      io.to("admins").emit("adminTxUpdate", { ...tx, status: finalStatus });
      console.log(`✅ TX ${tx.tx_hash} finalized: ${finalStatus}`);
    }
  } catch (err) {
    console.error("❌ Solana verifier error:", err.message);
  }
}

// ===================================================
// 🧩 HEALTH CHECK
// ===================================================
app.get("/", (req, res) => {
  res.send("✅ AuraTrade Realtime + Solana TX Verifier active");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);

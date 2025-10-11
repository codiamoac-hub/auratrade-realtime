// ===================================================
// 🌐 AuraTrade Realtime Server
// Chat + Solana Payment Verification + Supabase Sync
// ===================================================

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import pkg from "pg";
import "dotenv/config";

// ===================================================
// ⚙️ Environment Variables (Set these in Render)
// ===================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

const RPC_URL =
  "https://green-cosmopolitan-patina.solana-mainnet.quiknode.pro/aabe546d992ca75cc13fa9e855334094785a9b98";

// ===================================================
// 🗄️ Supabase + Postgres Connection
// ===================================================
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const { Client } = pkg;

// ===================================================
// 🚀 Express + Socket.IO Setup
// ===================================================
const app = express();
app.use(
  cors({
    origin: ["https://auratrade.fun"], // frontend domain
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
// 💬 CHAT SYSTEM — Always Working
// ===================================================
io.on("connection", (socket) => {
  console.log("✅ Client connected:", socket.id);

  // 💬 Chat messages
  socket.on("message", (msg) => {
    console.log("💬 Message received:", msg);
    io.emit("message", msg);
  });

  // 👑 Admin joins
  socket.on("joinAdmin", () => {
    console.log("👑 Admin joined:", socket.id);
    socket.join("admins");
  });

  // ===================================================
  // 💸 Transaction Submitted (Buyer/Seller)
  // ===================================================
  socket.on("transactionSubmitted", async (txData) => {
    console.log("💸 Transaction submitted:", txData);

    try {
      await supabase.from("transactions").insert([
        {
          order_id: txData.order_id,
          tx_hash: txData.tx_hash,
          status: "pending",
          amount: txData.amount,
          currency: txData.currency,
          user_id: txData.user_id,
          role: txData.role,
        },
      ]);

      // broadcast to all
      io.emit(`transactionUpdate:${txData.order_id}`, {
        type: "pending",
        ...txData,
      });

      // start solana verification background
      verifySolanaTx(txData);
    } catch (err) {
      console.error("❌ Error saving TX:", err.message);
    }
  });

  // ===================================================
  // 👑 Admin Verifies Transaction
  // ===================================================
  socket.on("verifyTransaction", async ({ tx_hash, status, verified_by }) => {
    console.log(`🔍 Admin ${verified_by} → ${status} TX: ${tx_hash}`);

    try {
      await supabase
        .from("transactions")
        .update({ status, verified_by })
        .eq("tx_hash", tx_hash);

      io.to("admins").emit("adminTxVerified", { tx_hash, status });
      io.emit("transactionUpdate", { tx_hash, status });
    } catch (err) {
      console.error("❌ Error verifying TX:", err.message);
    }
  });

  // 🚪 Handle disconnect
  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// ===================================================
// 🧠 Solana TX Verification Function
// ===================================================
async function verifySolanaTx(tx) {
  console.log(`🔍 Verifying Solana TX: ${tx.tx_hash}`);

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

      console.log(`✅ TX ${tx.tx_hash} → ${finalStatus}`);
    }
  } catch (err) {
    console.error("❌ Solana verification failed:", err.message);
  }
}

// ===================================================
// 📡 PostgreSQL Listener for Supabase Trigger (pg_notify)
// ===================================================
if (DATABASE_URL) {
  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  pgClient
    .connect()
    .then(() => {
      console.log("🟢 Connected to Postgres Realtime Listener");
      pgClient.query("LISTEN transactions_changes");
    })
    .catch((err) => console.error("❌ Postgres connection failed:", err.message));

  pgClient.on("notification", async (msg) => {
    try {
      const tx = JSON.parse(msg.payload);
      console.log("📡 Triggered update from Supabase:", tx);

      // Emit realtime event to all users
      io.emit("transactionUpdate", tx);
      io.to("admins").emit("adminTxUpdate", tx);

      // Background Solana verification
      if (tx.status === "pending" && tx.tx_hash) {
        await verifySolanaTx(tx);
      }
    } catch (err) {
      console.error("❌ Error processing pg_notify:", err.message);
    }
  });
} else {
  console.warn("⚠️ DATABASE_URL not found — realtime listener disabled");
}

// ===================================================
// 🧩 Health Check Endpoint
// ===================================================
app.get("/", (req, res) => {
  res.send("AuraTrade Realtime Server ✅ (Chat + Solana Verification Active)");
});

// ===================================================
// 🚀 Start Server
// ===================================================
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

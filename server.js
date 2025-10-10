import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

// 🪙 Solana RPC
const RPC_URL = "https://green-cosmopolitan-patina.solana-mainnet.quiknode.pro/aabe546d992ca75cc13fa9e855334094785a9b98";

// ⚙️ Supabase client
const supabase = createClient(
  "https://sdknfiufozodqhwhslaa.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNka25maXVmb3pvZHFod2hzbGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNTAyNzMsImV4cCI6MjA3NDgyNjI3M30.EhsCvTUmZwBq4VFTCp0cCkTkLZUAiW4t88vcLLn5684"
);

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

  socket.on("message", (msg) => {
    console.log("💬 Message received:", msg);
    io.emit("message", msg);
  });

  socket.on("joinAdmin", () => {
    console.log("👑 Admin joined:", socket.id);
    socket.join("admins");
  });

  socket.on("verifyTransaction", async ({ tx_hash, status, verified_by }) => {
    console.log(`🔍 Admin verified TX: ${tx_hash} → ${status}`);

    await supabase
      .from("transactions")
      .update({ status, verified_by })
      .eq("tx_hash", tx_hash);

    io.to("admins").emit("adminTxVerified", { tx_hash, status });
    io.emit("transactionUpdate", { tx_hash, status });
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// ===================================================
// 🔁 SUPABASE REALTIME WATCHER
// ===================================================
supabase
  .channel("transactions-realtime")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "transactions" },
    async (payload) => {
      const tx = payload.new;
      console.log("📡 TX Update:", tx);

      // Immediately broadcast to frontend
      io.emit("transactionUpdate", tx);
      io.to("admins").emit("adminTxUpdate", tx);

      // Trigger Solana verification in background
      if (tx.status === "pending" && tx.tx_hash) {
        verifySolanaTx(tx);
      }
    }
  )
  .subscribe();

// ===================================================
// 🧠 Solana TX verifier
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
      // Update Supabase
      await supabase
        .from("transactions")
        .update({ status: finalStatus })
        .eq("tx_hash", tx.tx_hash);

      // Notify frontend
      io.emit("transactionUpdate", { ...tx, status: finalStatus });
      io.to("admins").emit("adminTxUpdate", { ...tx, status: finalStatus });

      console.log(`✅ TX ${tx.tx_hash} is now ${finalStatus}`);
    }
  } catch (err) {
    console.error("❌ Error verifying TX:", err.message);
  }
}

// ===================================================
// 🧩 Health check
// ===================================================
app.get("/", (req, res) => {
  res.send("AuraTrade Realtime + Solscan live verifier ✅");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
import { io } from "socket.io-client";
const socket = io("https://auratrade-realtime.onrender.com"); // your Render server URL

// Listen for live updates
useEffect(() => {
  socket.on("transactionUpdate", (tx) => {
    if (tx.order_id === currentOrderId) {
      setTransactions((prev) => {
        const exists = prev.find((t) => t.tx_hash === tx.tx_hash);
        if (exists) {
          return prev.map((t) => (t.tx_hash === tx.tx_hash ? tx : t));
        }
        return [...prev, tx];
      });
    }
  });

  return () => socket.off("transactionUpdate");
}, [currentOrderId]);

// When user submits a TX
const handleSubmit = async () => {
  const newTx = {
    order_id: currentOrderId,
    tx_hash,
    amount,
    currency,
    user_id,
    status: "pending",
    role: userRole,
  };

  // 1️⃣ Show immediately on screen (optimistic)
  setTransactions((prev) => [...prev, newTx]);

  // 2️⃣ Emit to backend
  socket.emit("transactionSubmitted", newTx);
};

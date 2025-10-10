import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

// === Supabase Config ===
const SUPABASE_URL = "https://sdknfiufozodqhwhslaa.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNka25maXVmb3pvZHFod2hzbGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNTAyNzMsImV4cCI6MjA3NDgyNjI3M30.EhsCvTUmZwBq4VFTCp0cCkTkLZUAiW4t88vcLLn5684";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// === Express + Socket.io Setup ===
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
// 💬 CHAT SYSTEM (KEEP AS IS — UNCHANGED)
// ===================================================
io.on("connection", (socket) => {
  console.log("✅ New client connected:", socket.id);

  socket.on("message", (msg) => {
    console.log("💬 Message received:", msg);
    io.emit("message", msg);
  });

  // ===================================================
  // 💸 TRANSACTION SYSTEM (Improved & Safe)
  // ===================================================
  socket.on("transactionSubmitted", async (txData) => {
    console.log("💸 Transaction submitted:", txData);

    try {
      const { error } = await supabase.from("transactions").insert([
        {
          order_id: txData.order_id,
          tx_hash: txData.tx_hash,
          status: "pending",
          amount: txData.amount,
          currency: txData.currency,
          user_id: txData.user_id,
          role: txData.role, // buyer / seller
        },
      ]);

      if (error) throw error;

      io.emit(`transactionUpdate:${txData.order_id}`, {
        type: "pending",
        ...txData,
      });
    } catch (err) {
      console.error("❌ Error saving TX:", err.message);
    }
  });

  // === ADMIN VERIFICATION ===
  socket.on(
    "verifyTransaction",
    async ({ order_id, tx_hash, verified_by, status }) => {
      console.log(`🔍 Admin ${status} TX:`, tx_hash);

      try {
        const { error } = await supabase
          .from("transactions")
          .update({ status, verified_by })
          .eq("tx_hash", tx_hash);

        if (error) throw error;

        io.emit(`transactionUpdate:${order_id}`, {
          type: status,
          tx_hash,
          verified_by,
        });
      } catch (err) {
        console.error("❌ Error verifying TX:", err.message);
      }
    }
  );

  // ===================================================
  // 🔁 SUPABASE REALTIME LISTENER (FALLBACK)
  // ===================================================
  const realtimeChannel = supabase
    .channel("transactions-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transactions" },
      (payload) => {
        console.log("🔄 Supabase Realtime payload:", payload);
        io.emit(`transactionUpdate:${payload.new.order_id}`, payload.new);
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED")
        console.log("✅ Supabase Realtime connected");
      if (status === "CHANNEL_ERROR")
        console.error("❌ Realtime channel error detected!");
    });

  // === Disconnect Cleanup ===
  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
    supabase.removeChannel(realtimeChannel);
  });
});

// === Root Health Check ===
app.get("/", (req, res) => {
  res.send("AuraTrade WebSocket + Realtime Transactions Server ✅");
});

// === Start Server ===
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

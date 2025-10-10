import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://sdknfiufozodqhwhslaa.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNka25maXVmb3pvZHFod2hzbGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNTAyNzMsImV4cCI6MjA3NDgyNjI3M30.EhsCvTUmZwBq4VFTCp0cCkTkLZUAiW4t88vcLLn568"
);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://auratrade.fun"],
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("✅ Admin connected:", socket.id);
});

// ✅ Watch Supabase for live TX updates
supabase
  .channel("transactions-admin")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "transactions" },
    (payload) => {
      console.log("📡 TX update:", payload.new);
      io.emit("adminUpdate", payload.new); // send live to admin frontend
    }
  )
  .subscribe();

app.get("/", (req, res) => {
  res.send("Render realtime bridge running ✅");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors({
  origin: ["https://auratrade.fun"], // your frontend domain
  methods: ["GET", "POST"]
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://auratrade.fun"], // allow frontend access
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("✅ New client connected:", socket.id);

  socket.on("message", (msg) => {
    console.log("💬 Message received:", msg);
    io.emit("message", msg); // broadcast back to everyone
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected");
  });
});

app.get("/", (req, res) => {
  res.send("AuraTrade WebSocket server is running ✅");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

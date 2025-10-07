import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // later replace this with your real website domain
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("✅ New user connected:", socket.id);

  // join a room for a specific order
  socket.on("join_order", (orderId) => {
    socket.join(orderId);
    console.log(`🟢 User joined room: ${orderId}`);
  });



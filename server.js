const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir));

app.get("/game", (req, res) => {
  res.type("html").sendFile(path.join(publicDir, "game.html"));
});

app.get("/", (req, res) => {
  res.redirect("game");
});

app.get("/controller", (req, res) => {
  res.type("html").sendFile(path.join(publicDir, "controller.html"));
});

io.on("connection", (socket) => {
  socket.on("host-join", ({ roomId }) => {
    if (!roomId) return;
    socket.data.role = "host";
    socket.join(roomId);
    socket.to(roomId).emit("status", { message: "Host connected" });
  });

  socket.on("controller-join", ({ roomId }) => {
    if (!roomId) return;
    socket.data.role = "controller";
    socket.join(roomId);
    io.to(roomId).emit("controller-status", { connected: true });
  });

  socket.on("controller-input", ({ roomId, direction }) => {
    if (!roomId) return;
    io.to(roomId).emit("controller-input", { direction });
  });

  socket.on("controller-start", ({ roomId }) => {
    if (!roomId) return;
    io.to(roomId).emit("controller-start");
  });

  socket.on("controller-reset", ({ roomId }) => {
    if (!roomId) return;
    io.to(roomId).emit("controller-reset");
  });

  socket.on("disconnecting", () => {
    const rooms = [...socket.rooms].filter((room) => room !== socket.id);
    if (socket.data.role === "controller") {
      rooms.forEach((roomId) => {
        io.to(roomId).emit("controller-status", { connected: false });
      });
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Pong server running on http://localhost:${PORT}`);
});

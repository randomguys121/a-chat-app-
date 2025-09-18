const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Filter = require('bad-words');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const filter = new Filter();

const chatLogs = {}; // { room: [ { user, message, time } ] }
const userLogs = {}; // { room: Set of usernames }

function saveChatLog(room) {
  const filePath = path.join(__dirname, 'chat_folder', `${room}_chat.json`);
  fs.writeFile(filePath, JSON.stringify(chatLogs[room] || [], null, 2), () => {});
}
function saveUserLog(room) {
  const filePath = path.join(__dirname, 'chat_folder', `${room}_users.json`);
  fs.writeFile(filePath, JSON.stringify(Array.from(userLogs[room] || []), null, 2), () => {});
}

// Allow iframe embedding from any origin
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  let currentRoom = null;
  let username = 'Anonymous';

  socket.on('join', ({ room, user }) => {
    currentRoom = room;
    username = user || 'Anonymous';
    socket.join(room);
    if (!chatLogs[room]) chatLogs[room] = [];
    if (!userLogs[room]) userLogs[room] = new Set();

    // If only one user is in the room (after refresh), archive and clear chat log
    setTimeout(() => {
      const userCount = userLogs[room] ? userLogs[room].size : 0;
      if (userCount === 1 && chatLogs[room] && chatLogs[room].length > 0) {
        saveChatLog(room); // already saves to file
        chatLogs[room] = [];
      }
    }, 500); // short delay to allow join

    userLogs[room].add(username);
    // Send chat log to new user
    socket.emit('chat log', chatLogs[room]);
    io.to(room).emit('user joined', username);
    saveUserLog(room);
  });

  socket.on('chat message', (msg) => {
    if (!currentRoom) return;
    const cleanMsg = filter.clean(msg);
    const entry = { user: username, message: cleanMsg, time: new Date().toISOString() };
    chatLogs[currentRoom].push(entry);
  io.to(currentRoom).emit('chat message', entry);
  saveChatLog(currentRoom);
  });

  socket.on('disconnect', () => {
    if (currentRoom && userLogs[currentRoom]) {
      userLogs[currentRoom].delete(username);
  io.to(currentRoom).emit('user left', username);
  saveUserLog(currentRoom);
    }
  });
});

// Endpoint to get chat log for a room
app.get('/chat_log/:room', (req, res) => {
  const room = req.params.room;
  res.json(chatLogs[room] || []);
});

// Endpoint to get user log for a room
app.get('/user_log/:room', (req, res) => {
  const room = req.params.room;
  res.json(Array.from(userLogs[room] || []));
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

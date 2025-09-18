const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Filter = require('bad-words');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const filter = new Filter();

const chatLogs = {}; // { room: [ { user, message, time } ] }
const userLogs = {}; // { room: Set of usernames }

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
    userLogs[room].add(username);
    // Send chat log to new user
    socket.emit('chat log', chatLogs[room]);
    io.to(room).emit('user joined', username);
  });

  socket.on('chat message', (msg) => {
    if (!currentRoom) return;
    const cleanMsg = filter.clean(msg);
    const entry = { user: username, message: cleanMsg, time: new Date().toISOString() };
    chatLogs[currentRoom].push(entry);
    io.to(currentRoom).emit('chat message', entry);
  });

  socket.on('disconnect', () => {
    if (currentRoom && userLogs[currentRoom]) {
      userLogs[currentRoom].delete(username);
      io.to(currentRoom).emit('user left', username);
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

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log('Share your local IP address (e.g., http://192.168.x.x:3000) for others to join.');
});

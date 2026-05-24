require('dotenv').config();
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const authRoutes = require('./src/routes/authRoutes');
const roomRoutes = require('./src/routes/roomRoutes');
const executeRoutes = require('./src/routes/executeRoutes');
const aiRoutes = require('./src/routes/aiRoutes');
const Room = require('./src/models/Room');

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const roomUsers = new Map();

const getRoomUsersList = (roomId) => {
  const users = roomUsers.get(roomId);
  if (!users) return [];
  return Array.from(users.values());
};

const removeUserFromRoom = (socket, roomId) => {
  const users = roomUsers.get(roomId);
  if (!users) return;

  users.delete(socket.id);
  if (users.size === 0) {
    roomUsers.delete(roomId);
  }

  io.to(roomId).emit('room-users', getRoomUsersList(roomId));
};

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/execute', executeRoutes);
app.use('/api/ai', aiRoutes);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', async ({ roomId, userId, name }) => {
    if (!roomId) return;

    socket.join(roomId);

    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, new Map());
    }

    roomUsers.get(roomId).set(socket.id, {
      socketId: socket.id,
      userId,
      name,
    });

    socket.currentRoom = roomId;

    io.to(roomId).emit('room-users', getRoomUsersList(roomId));

    try {
      const room = await Room.findOne({ roomId, isActive: true }).select('messages');
      if (room) {
        const messages = room.messages.slice(-50).map((m) => ({
          userId: m.userId,
          name: m.name,
          content: m.content,
          timestamp: m.timestamp,
        }));
        socket.emit('chat-history', messages);
      }
    } catch (err) {
      console.error('Failed to fetch chat history:', err.message);
    }
  });

  socket.on('code-change', ({ roomId, code }) => {
    if (!roomId) return;
    socket.to(roomId).emit('code-change', { code });
  });

  socket.on('language-change', ({ roomId, language }) => {
    if (!roomId) return;
    io.to(roomId).emit('language-change', { language });
  });

  socket.on('send-message', async ({ roomId, userId, name, content }) => {
    if (!roomId || !content) return;

    const timestamp = new Date();
    const message = { userId, name, content, timestamp };

    try {
      await Room.findOneAndUpdate(
        { roomId, isActive: true },
        { $push: { messages: message } }
      );
      io.to(roomId).emit('receive-message', message);
    } catch (err) {
      console.error('Failed to save message:', err.message);
    }
  });

  socket.on('cursor-change', ({ roomId, userId, name, lineNumber, column }) => {
    if (!roomId) return;
    socket.to(roomId).emit('cursor-change', {
      userId,
      name,
      lineNumber,
      column,
    });
  });

  socket.on('leave-room', ({ roomId }) => {
    if (!roomId) return;

    socket.leave(roomId);
    removeUserFromRoom(socket, roomId);
    socket.currentRoom = null;
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    if (socket.currentRoom) {
      removeUserFromRoom(socket, socket.currentRoom);
    } else {
      roomUsers.forEach((users, roomId) => {
        if (users.has(socket.id)) {
          removeUserFromRoom(socket, roomId);
        }
      });
    }
  });
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

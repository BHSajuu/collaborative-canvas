import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import {
  DrawEventData,
  startUserAction,
  stopUserAction,
  addUserEvent,
  performUndo,
  performRedo,
  getActionHistory,
  clearActiveAction,
} from './drawing-state';


const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = process.env.PORT || 3000;

 // User state and cursor types
interface User {
  id: string;
  color: string;
  name: string;
}
interface CursorMoveData {
  x: number;
  y: number;
}

// Stores the state of all connected users
const activeUsers = new Map<string, User>();

// Simple array of colors to assign to new users
const userColors = [
  '#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A133FF', '#33FFF6',  '#FFCC33', '#33CCFF','#3333FF', '#6633FF', '#FF3366', '#FF9999','#FF66CC', '#6699FF',
];


// Serve static files from the client directory
const clientPath = path.join(__dirname, '..', 'client');

app.get('/api/rooms', (req, res) => {
  const allRooms = io.sockets.adapter.rooms;
  const publicRooms: string[] = [];

  allRooms.forEach((socketIds, roomName) => {
    if (!socketIds.has(roomName)) {
      publicRooms.push(roomName);
    }
  });

  res.json(publicRooms);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'lobby.html'));
});

app.use(express.static(clientPath));


// This function now sends the history *for a specific room*
function sendFullStateToSocket(socket: Socket, roomName: string) {
  socket.emit('global-redraw', getActionHistory(roomName));
}

// Define a type for our socket to track its room
interface SocketWithRoom extends Socket {
  roomName?: string;
}

io.on('connection', async (socket: SocketWithRoom) => {
  console.log('A user connected:', socket.id);
  
  //  Room Logic
  const roomName = (socket.handshake.query.room as string) || 'default';
  socket.roomName = roomName; // Store the room name on the socket
  socket.join(roomName);
  console.log(`User ${socket.id} joined room ${roomName}`);

  // User Connection Logic
  const color = userColors[Math.floor(Math.random() * userColors.length)];
  const newUserName = `Guest`;
  const newUser: User = { id: socket.id, color: color, name: newUserName };
  activeUsers.set(socket.id, newUser);

  // --- NEW: Get users *only in the same room* ---
  const socketsInRoom = await io.in(roomName).fetchSockets();
  const socketIdsInRoom = new Set(socketsInRoom.map(s => s.id));
  
  const othersInRoom = Array.from(activeUsers.values()).filter(
    user => socketIdsInRoom.has(user.id) && user.id !== socket.id
  );

  // Send a 'welcome' event to the new user
 socket.emit('welcome', {
    self: newUser,
    others: othersInRoom,
  });

// Broadcast to everyone else in the room
  socket.broadcast.to(roomName).emit('new-user-connected', newUser);
 
// Send the full state for this room
  sendFullStateToSocket(socket, roomName);
   
  // Listen for start/stop drawing 
  socket.on('start-drawing', (startEvent: DrawEventData) => {
    if (!socket.roomName) return;
    startUserAction(socket.roomName, socket.id, startEvent);
    socket.broadcast.to(socket.roomName).emit('draw-event', startEvent);
  });
  
 socket.on('stop-drawing', () => {
    if (!socket.roomName) return;
    const committedAction = stopUserAction(socket.roomName, socket.id);
    if (committedAction) {
      // Broadcast to *everyone in the room* (including sender)
      io.to(socket.roomName).emit('action-committed', committedAction);
    }
  });

  socket.on('draw-event', (data: DrawEventData) => {
    if (!socket.roomName) return;
    addUserEvent(socket.roomName, socket.id, data);
    socket.broadcast.to(socket.roomName).emit('draw-event', data);
  });
  
  socket.on('undo', () => {
    if (!socket.roomName) return;
    const undoneAction = performUndo(socket.roomName);
    if (undoneAction) {
      io.to(socket.roomName).emit('perform-undo', undoneAction.id);
    }
  });

  socket.on('redo', () => {
    if (!socket.roomName) return;
    const redoneAction = performRedo(socket.roomName);
    if (redoneAction) {
      io.to(socket.roomName).emit('perform-redo', redoneAction);
    }
  });

  socket.on('cursor-move', (data: CursorMoveData) => {
    if (!socket.roomName) return;
    socket.broadcast.to(socket.roomName).emit('cursor-move', {
      id: socket.id,
      ...data,
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    activeUsers.delete(socket.id);
    clearActiveAction(socket.id); // NEW
    
    // Broadcast disconnection to all rooms the user *might* have been in
    // (A more robust solution would be to track all rooms a user is in)
    if (socket.roomName) {
      io.to(socket.roomName).emit('user-disconnected', socket.id);
    }
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
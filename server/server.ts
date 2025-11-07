import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import {
  DrawEventData,
  startUserAction,
  stopUserAction,
  addUserEvent,
  performUndo,
  performRedo,
  getActionHistory
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
app.use(express.static(clientPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});


/**
 * Helper function to send the full, current state to all clients.
 * This is the only way state is sent now. It guarantees consistency.
 */
function broadcastFullState() {
  io.emit('global-redraw', getActionHistory());
}


io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
   
  
  // User Connection Logic
  const color = userColors[Math.floor(Math.random() * userColors.length)];
  const newUserName = `Guest`;

  const newUser: User = {
    id: socket.id,
    color: color,
    name: newUserName,
  };

  activeUsers.set(socket.id, newUser);

  // Send a 'welcome' event to the new user
  socket.emit('welcome', {
    self: newUser,
    others: Array.from(activeUsers.values()).filter(u => u.id !== socket.id),
  });
  
  socket.broadcast.emit('new-user-connected', newUser);
 
  // Send the full state on connect 
  socket.emit('global-redraw', getActionHistory());

   
  // Listen for start/stop drawing 
  socket.on('start-drawing', (startEvent: DrawEventData) => {
    startUserAction(socket.id, startEvent);
    // Also broadcast this first point so it's live
    socket.broadcast.emit('draw-event', startEvent);
  });
  
  socket.on('stop-drawing', () => {
    stopUserAction(socket.id);
  });


 //  'draw-event' now adds to an active action 
  socket.on('draw-event', (data: DrawEventData) => {
    addUserEvent(socket.id, data);
    // Broadcast for live-drawing
    socket.broadcast.emit('draw-event', data);
  });
  
  // Undo/Redo Logic
  socket.on('undo', () => {
    const undoneAction = performUndo();
    // Only broadcast if an action was actually undone
    if (undoneAction) {
      broadcastFullState();
    }
  });

  socket.on('redo', () => {
    const redoneAction = performRedo();
    // Only broadcast if an action was actually redone
    if (redoneAction) {
      broadcastFullState();
    }
  });

  // Cursor Move Logic 
  socket.on('cursor-move', (data: CursorMoveData) => {
    // Broadcast this move to all other clients, including the sender's ID
    socket.broadcast.emit('cursor-move', {
      id: socket.id,
      ...data,
    });
  });


  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    activeUsers.delete(socket.id);
    io.emit('user-disconnected', socket.id);
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
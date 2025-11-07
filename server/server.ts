import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = process.env.PORT || 3000;


// This is our "WebSocket Protocol" 
interface DrawEventData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  lineWidth: number;
}

// Action-based History
// A "DrawAction" is a single stroke (mousedown to mouseup)
// It contains all the small segments that make it up.
interface DrawAction {
  id: string; 
  events: DrawEventData[];
}


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

// Refactored Server State
const actionHistory: DrawAction[] = [];

// This stack stores undone actions
const redoStack: DrawAction[] = [];

// This maps a socket ID to the action they are *currently* drawing
const activeActions = new Map<string, DrawAction>();

// Stores the state of all connected users
const activeUsers = new Map<string, User>();

// Simple array of colors to assign to new users
const userColors = [
  '#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A133FF', '#33FFF6', '#FF3333', '#FFCC33', '#33CCFF','#3333FF', '#6633FF', '#FF3366', '#FF9999','#FF66CC', '#6699FF',
];

let guestCounter = 1;

// Serve static files from the client directory
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});


// Helper function to send the full state
// This is the only way state is sent now. It guarantees consistency.
function broadcastFullState() {
  io.emit('global-redraw', actionHistory);
}


io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
   
  
  // User Connection Logic
  const color = userColors[Math.floor(Math.random() * userColors.length)];
  const newUserName = `Guest ${guestCounter++}`;

  const newUser: User = {
    id: socket.id,
    color: color,
    name: newUserName,
  };

  activeUsers.set(socket.id, newUser);

  // Send a 'welcome' event to the new user
  // This tells them their own details and who else is online
  socket.emit('welcome', {
    self: newUser,
    others: Array.from(activeUsers.values()).filter(u => u.id !== socket.id),
  });
  
  socket.broadcast.emit('new-user-connected', newUser);
 
  // Send the full state on connect 
  socket.emit('global-redraw', actionHistory);

   
  // Listen for start/stop drawing 
  socket.on('start-drawing', (startEvent: DrawEventData) => {
    const newAction: DrawAction = {
      id: `${socket.id}-${Date.now()}`,
      events: [startEvent], // Start the action with its first event
    };
    activeActions.set(socket.id, newAction);
    // Also broadcast this first point so it's "live"
    socket.broadcast.emit('draw-event', startEvent);
  });
  
  socket.on('stop-drawing', () => {
    const action = activeActions.get(socket.id);
    if (action) {
      // Move from "active" to "history"
      actionHistory.push(action);
      activeActions.delete(socket.id);
      
      // Clear the redo stack, since a new action breaks the redo chain
      redoStack.length = 0;
    }
  });


 //  'draw-event' now adds to an active action 
  socket.on('draw-event', (data: DrawEventData) => {
    // Add to the active action
    const action = activeActions.get(socket.id);
    if (action) {
      action.events.push(data);
    }
    // Broadcast for live-drawing
    socket.broadcast.emit('draw-event', data);
  });
  
  // Undo/Redo Logic
  socket.on('undo', () => {
    if (actionHistory.length > 0) {
      const actionToUndo = actionHistory.pop()!;
      redoStack.push(actionToUndo);
      // Now, tell everyone to redraw the entire canvas
      broadcastFullState();
    }
  });

  socket.on('redo', () => {
    if (redoStack.length > 0) {
      const actionToRedo = redoStack.pop()!;
      actionHistory.push(actionToRedo);
      // Tell everyone to redraw
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
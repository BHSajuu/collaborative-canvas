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

// This will store every drawing event in order
const drawingHistory: DrawEventData[] = [];


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
 
  // A new user has connected. Send them the entire drawing history.
  socket.emit('load-history', drawingHistory);

  // Listen for drawing events from a client
  socket.on('draw-event', (data: DrawEventData) => {
    // Add the new drawing event to our history
    drawingHistory.push(data);
    // Broadcast the event to all other clients
    socket.broadcast.emit('draw-event', data);
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
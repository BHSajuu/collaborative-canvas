import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = process.env.PORT || 3000;

// Define a type for our drawing data for safety
// This is our "WebSocket Protocol" 
interface DrawEventData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  lineWidth: number;
}

// This will store every drawing event in order
const drawingHistory: DrawEventData[] = [];

// Serve static files from the client directory
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // A new user has connected. Send them the entire drawing history.
  socket.emit('load-history', drawingHistory);

  // Listen for drawing events from a client
  socket.on('draw-event', (data: DrawEventData) => {
    // Add the new drawing event to our history
    drawingHistory.push(data);
    // Broadcast the event to all other clients
    socket.broadcast.emit('draw-event', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
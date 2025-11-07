import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = process.env.PORT || 3000;

// Serve static files from the "client" directory
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

// Handle root route
app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Handle socket connections
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
# Real-Time Collaborative Drawing Canvas

A multi-user, real-time drawing application built with TypeScript, Node.js, and WebSockets. Multiple users can join named rooms and draw simultaneously on a shared canvas. Drawings, cursors, and actions are synchronized in real time.

---
live link:- https://collaborative-canvas-production-4c99.up.railway.app/lobby.html

## 🌟 Features

### Core Requirements
- Drawing tools: Brush, Eraser, Color Picker, and Stroke Width adjuster.
- Real-time sync: Drawing actions are broadcast to all connected clients instantly.
- Live user cursors with user names.
- Online user list with assigned colors.
- Global undo/redo affecting all users in the room.
- Clear canvas with confirmation.

### Bonus Features
- Room system for joining/creating rooms.
- Drawing persistence via Vercel KV.
- Mobile touch support.
- Rectangle drawing tool with preview.

---

## 🛠️ Tech Stack
- **Frontend:** TypeScript, HTML Canvas, CSS
- **Backend:** Node.js, Express
- **Real-time:** Socket.io
- **Persistence:** Vercel KV
- **Tooling:** TypeScript, nodemon, ts-node

---

## 🚀 Setup and Running Locally

### 1. Install dependencies
```bash
git clone https://github.com/BHSajuu/collaborative-canvas.git
cd collaborative-canvas
npm install
```

### 2. Environment variables
Create `.env` file:
```
KV_REST_API_URL=your_api_url
KV_REST_API_TOKEN=your_api_token
PORT=3000
```

### 3. Run
```bash
npm run build
npm start
```

For development:
```bash
npm run dev
```

Open http://localhost:3000.

---

## 🧪 How to Test with Multiple Users
- Open the app in browser windows.
- You will see the lobby. Create a new room (e.g., "test-room"). You will be redirected to the canvas.
- Open a second browser window and open the app again.
- You will see "test-room" in the "Active Rooms" list. Click it to join.
- Draw in one window. You should see the drawing, cursor, and user list update in the other window instantly.
- Test the Undo/Redo and Clear Canvas buttons to ensure they update both clients.

---

## Known Limitations
- Conflict Resolution: The current conflict resolution strategy is a simple "last write wins" event stream. If two users draw in the exact same spot at the exact same millisecond, the server will just process the events as they arrive. This is sufficient for this application but is not as robust as OT or CRDTs for complex overlaps.
- Event Throttling: Drawing events are sent on every mouse move (draw-event), which can be network-intensive. A more optimized solution might batch or throttle these events.
- Error Handling: Client-side error handling is minimal. If the WebSocket connection is lost, the user is not given a clear "reconnecting..." message.
---

## Time Spent (example)
| Task | Time |
| --- | --- |
| Setup & Architecture | 4 hrs |
| Canvas + WebSockets | 9 hrs |
| Undo/Redo & Sync Logic | 6 hrs |
| Persistence (KV) | 2 hrs |
| UI Work | 3 hrs |
| **Total** | ~24 hrs |

---



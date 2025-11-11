# Real-Time Collaborative Drawing Canvas

A multi-user, real-time drawing application built with TypeScript, Node.js, and WebSockets. Multiple users can join named rooms and draw simultaneously on a shared canvas. Drawings, cursors, and actions are synchronized in real time.

---

## Features

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

## Tech Stack
- **Frontend:** TypeScript, HTML Canvas, CSS
- **Backend:** Node.js, Express
- **Real-time:** Socket.io
- **Persistence:** Vercel KV
- **Tooling:** TypeScript, nodemon, ts-node

---

## Setup

### 1. Install dependencies
```bash
git clone https://github.com/your-username/collaborative-canvas.git
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

## Testing Multiple Users
- Open the app in two browser windows.
- Join the same room.
- Draw in one window and verify real-time sync in the other.
- Test undo/redo and clear actions across both.

---

## Known Limitations
- "Last write wins" conflict resolution.
- High event frequency during drawing (could be throttled).
- Minimal UI reconnection feedback.

---

## Time Spent (example)
| Task | Time |
| --- | --- |
| Setup & Architecture | 4 hrs |
| Canvas + WebSockets | 6 hrs |
| Undo/Redo & Sync Logic | 5 hrs |
| Persistence (KV) | 2 hrs |
| UI Work | 3 hrs |
| **Total** | ~20 hrs |

---

## Project Structure
| Folder | Description |
| --- | --- |
| `/client` | Frontend canvas & UI logic |
| `/server` | Backend WebSocket + API logic |
| `/server/drawing-state.ts` | Manages KV persistence |


/// <reference types="socket.io-client" />


import { DrawEventData, DrawAction, User, Cursor } from "./types.js";
import {  performDraw, drawCursors } from "./canvas.js";


declare const io: any;

// Get room from URL query
const roomQuery = new URLSearchParams(window.location.search).get('room');
export const currentRoom = roomQuery || 'default'; 

//  Pass room query to socket
export const socket = io({
  query: { room: currentRoom }
});

socket.on('connect', () => {
  console.log(`Connected to server with ID: ${socket.id} in room: ${currentRoom}`);
});

//  Socket Emitters 
// These functions are wrappers around socket.emit
export function emitStartDrawing(data: DrawEventData) {
  socket.emit('start-drawing', data);
}
export function emitDrawEvent(data: DrawEventData) {
  socket.emit('draw-event', data);
}
export function emitStopDrawing() {
  socket.emit('stop-drawing');
}
export function emitCursorMove(x: number, y: number) {
  socket.emit('cursor-move', { x, y });
}
export function emitUndo() {
  socket.emit('undo');
}
export function emitRedo() {
  socket.emit('redo');
}

export function emitDrawShape(data: DrawEventData) {
  socket.emit('draw-shape', data);
}

export function emitClearCanvas() {
  socket.emit('clear-canvas');
}


//  Socket Event Listeners 
export function registerSocketEvents(
  // UI/User functions
  setSelfUser: (user: User) => void,
  getCursors: () => Map<string, Cursor>,
  updateUserListUI: () => void,
  // State/History functions
  setHistory: (history: DrawAction[]) => void,
  addCommittedAction: (action: DrawAction) => void,
  undoActionById: (actionId: string) => void,
  redoAction: (action: DrawAction) => void,
  clearCanvas: () => void 
) {

  // User/Cursor Listeners
  socket.on('welcome', (data: { self: User, others: User[] }) => {
    setSelfUser(data.self); 
    const cursors = getCursors();
    cursors.clear();
    for (const user of data.others) {
      cursors.set(user.id, { x: 0, y: 0, color: user.color , name: user.name});
    }
    updateUserListUI(); 
  });

  socket.on('new-user-connected', (user: User) => {
    console.log('New user connected:', user.id);
    getCursors().set(user.id, { x: 0, y: 0, color: user.color, name: user.name });
    updateUserListUI();
  });
  
  socket.on('user-disconnected', (id: string) => {
    console.log('User disconnected:', id);
    const cursors = getCursors();
    cursors.delete(id); 
    updateUserListUI();
    drawCursors(cursors); 
  });

  socket.on('cursor-move', (data: { id: string, x: number, y: number }) => {
    const cursors = getCursors();
    const cursor = cursors.get(data.id);
    if (cursor) {
      cursor.x = data.x;
      cursor.y = data.y;
      drawCursors(cursors); 
    }
  });

  // History/Drawing Listeners 
  // This is for live drawing, from other users
  socket.on('draw-event', (data: DrawEventData) => {
      performDraw(data);
  });

  // This is for new users, to get the full history
  socket.on('global-redraw', (history: DrawAction[]) => {
    console.log(`Global redraw. Re-playing ${history.length} actions.`);
    setHistory(history); // Hand off to main.ts to build the cache
  });

  // When any user finishes a stroke
  socket.on('action-committed', (action: DrawAction) => {
    addCommittedAction(action); // Add to local history and save snapshot
  });

  //  When an undo happens
  socket.on('perform-undo', (actionId: string) => {
    undoActionById(actionId); // Restore from cache
  });

  //  When a redo happens
  socket.on('perform-redo', (action: DrawAction) => {
    redoAction(action); // Re-draw one action and save snapshot
  });

  // When a clear event happens
  socket.on('perform-clear', () => {
    clearCanvas(); // Call the function from main.ts
  });
}
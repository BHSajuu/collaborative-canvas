/// <reference types="socket.io-client" />


import { DrawEventData, DrawAction, User, Cursor } from "./types.js";
import { ctx, canvas, performDraw, drawCursors } from "./canvas.js";


declare const io: any;

//  Socket Initialization 
export const socket = io();

socket.on('connect', () => {
  console.log('Connected to server with ID:', socket.id);
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


//  Socket Event Listeners 
// This function is called by main.ts to set up all listeners

export function registerSocketEvents(
  setSelfUser: (user: User) => void,
  getCursors: () => Map<string, Cursor>,
  updateUserListUI: () => void
) {

  socket.on('welcome', (data: { self: User, others: User[] }) => {
    setSelfUser(data.self); // Store our own details
    const cursors = getCursors();
    // Add all other users to the cursors map
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
    cursors.delete(id); // Remove from map
    updateUserListUI();
    drawCursors(cursors); // Redraw to remove their cursor
  });

  socket.on('cursor-move', (data: { id: string, x: number, y: number }) => {
    const cursors = getCursors();
    // Update the position in our map
    const cursor = cursors.get(data.id);
    if (cursor) {
      cursor.x = data.x;
      cursor.y = data.y;
      drawCursors(cursors); // Redraw all cursors
    }
  });


  // Listen for drawing events from other users
  socket.on('draw-event', (data: DrawEventData) => {
      performDraw(data);
  });

  // The core of the undo/redo
  socket.on('global-redraw', (history: DrawAction[]) => {
    console.log(`Global redraw. Re-playing ${history.length} actions.`);
    
    //  Clear the entire canvas
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Loop through every action and every event and redraw
    for (const action of history) {
      for (const event of action.events) {
        performDraw(event);
      }
    }
  });

}
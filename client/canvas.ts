import { DrawEventData, Cursor } from "./types.js";

// Get UI Elements 
export const canvas = document.getElementById('drawing-canvas') as HTMLCanvasElement;
export const cursorCanvas = document.getElementById('cursor-canvas') as HTMLCanvasElement;

if (!canvas || !cursorCanvas) {
  throw new Error("Failed to find canvas elements");
}

// Get Contexts
export const ctx = canvas.getContext('2d');
export const cursorCtx = cursorCanvas.getContext('2d');

if (!ctx || !cursorCtx) {
  throw new Error("Failed to get 2D context");
}

// Set canvas size
canvas.width = 1000;  
canvas.height = 700;  
cursorCanvas.width = 1000; 
cursorCanvas.height = 700; 

/**
 * This function performs the actual drawing on the canvas.
 * It's called by both the local mouse events and the server socket events.
 */
export function performDraw(data: DrawEventData) {
  if(!ctx) return;
  ctx.strokeStyle = data.color;
  ctx.lineWidth = data.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(data.fromX, data.fromY);
  ctx.lineTo(data.toX, data.toY);
  ctx.stroke();
}


// Cursor Drawing Function 
export function drawCursors(cursors: Map<string, Cursor>) {
  if(!cursorCtx) return;
  // Clear the entire cursor canvas
  cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

  // Draw each cursor
  for (const [id, cursor] of cursors.entries()) {
    cursorCtx.strokeStyle = cursor.color;
    cursorCtx.fillStyle = cursor.color;
    cursorCtx.lineWidth = 2;

    // Draw a simple circle
    cursorCtx.beginPath();
    cursorCtx.arc(cursor.x, cursor.y, 5, 0, 2 * Math.PI);
    cursorCtx.stroke();
    
    // Draw a name tag
    cursorCtx.font = '12px Arial';
    cursorCtx.fillText(cursor.name, cursor.x + 10, cursor.y + 5);
  }
}


/**
 * This function performs drawing a rectangle.
 * It's called by both local mouse events and server socket events.
 */
export function performDrawRect(data: DrawEventData) {
  if (!ctx) return;

  ctx.strokeStyle = data.color; 
  ctx.lineWidth = data.lineWidth; 
  
  // Calculate width and height from the two points
  const width = data.toX - data.fromX;
  const height = data.toY - data.fromY;

  ctx.beginPath();
  ctx.rect(data.fromX, data.fromY, width, height);
  ctx.stroke(); 
}
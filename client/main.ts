/// <reference types="socket.io-client" />


interface DrawEventData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  lineWidth: number;
}

interface DrawAction {
  id: string;
  events: DrawEventData[];
}

interface User {
  id: string;
  color: string;
  name: string;
}
interface Cursor {
  x: number;
  y: number;
  color: string;
  name: string;
}

type Tool = 'brush' | 'eraser';
const CANVAS_BACKGROUND = '#FFFFFF';

window.addEventListener('load', () => {
  const socket = io();
  socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
  });

  // Get UI Elements 
  const canvas = document.getElementById('drawing-canvas') as HTMLCanvasElement;
  const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
  const strokeWidth = document.getElementById('stroke-width') as HTMLInputElement;
  const strokeValue = document.getElementById('stroke-value') as HTMLSpanElement;
  const eraserTool = document.getElementById('eraser-tool') as HTMLButtonElement;
  const cursorCanvas = document.getElementById('cursor-canvas') as HTMLCanvasElement;
  const userList = document.getElementById('user-list') as HTMLUListElement;
  const undoButton = document.getElementById('undo-button') as HTMLButtonElement;
  const redoButton = document.getElementById('redo-button') as HTMLButtonElement;

 if (!canvas || !colorPicker || !strokeWidth || !strokeValue || !eraserTool || !cursorCanvas || !userList || !undoButton || !redoButton) { 
    console.error('Failed to find one or more UI elements');
    return;
  }

  const ctx = canvas.getContext('2d');
  const cursorCtx = cursorCanvas.getContext('2d');

  if (!ctx || !cursorCtx) { 
    console.error('Failed to get 2D context');
    return;
  }

  // Set canvas size
  canvas.width = 800;
  canvas.height = 600;
  cursorCanvas.width = 800;
  cursorCanvas.height = 600;

  // Drawing state
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let currentTool: Tool = 'brush';
  let lastBrushColor = colorPicker.value;
  
  // Client State
  let selfUser: User | null = null;
  // Stores the state of all other users' cursors
  const cursors = new Map<string, Cursor>();

  colorPicker.classList.add('active');

  // Update stroke width display
  strokeWidth.addEventListener('input', (e) => {
    strokeValue.textContent = (e.target as HTMLInputElement).value;
  });
  
 
  // Tool Switching Logic
  function setActiveTool(tool: Tool) {
    currentTool = tool;
    
    if (tool === 'brush') {
      eraserTool.classList.remove('active');
      colorPicker.classList.add('active');
      colorPicker.value = lastBrushColor;
    } else if (tool === 'eraser') {
      colorPicker.classList.remove('active');
      eraserTool.classList.add('active');
    }
  }

  // Switch to brush when color is clicked/changed
  colorPicker.addEventListener('input', () => {
    lastBrushColor = colorPicker.value;
    setActiveTool('brush');
  });
  colorPicker.addEventListener('click', () => {
    setActiveTool('brush');
  });

  // Switch to eraser when clicked
  eraserTool.addEventListener('click', () => {
    setActiveTool('eraser');
  });

  /**
   * This function performs the actual drawing on the canvas.
   * It's called by both the local mouse events and the server socket events.
   */
  function performDraw(data: DrawEventData) {
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
  function drawCursors() {
    if(!cursorCtx) return;
    // Clear the *entire* cursor canvas
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

  // UI Update Function 
  function updateUserListUI() {
    userList.innerHTML = ''; // Clear the list

    // Add self
    if (selfUser) {
      const selfLi = document.createElement('li');
      selfLi.innerHTML = `
        <div class="color-swatch" style="background-color: ${selfUser.color}"></div>
        <span>${selfUser.name} (You)</span>
      `;
      userList.appendChild(selfLi);
    }

    // Add others
    for (const [id, cursor] of cursors.entries()) {
      const otherLi = document.createElement('li');
      otherLi.innerHTML = `
        <div class="color-swatch" style="background-color: ${cursor.color}"></div>
        <span>${cursor.name}</span>
      `;
      userList.appendChild(otherLi);
    }
  }


  //  Local Event Handlers 
function getDrawData(e: MouseEvent): DrawEventData {
    const x = e.offsetX;
    const y = e.offsetY;
    let drawColor = (currentTool === 'brush') ? colorPicker.value : CANVAS_BACKGROUND;
    
    const data: DrawEventData = {
      fromX: lastX,
      fromY: lastY,
      toX: x,
      toY: y,
      color: drawColor,
      lineWidth: parseInt(strokeWidth.value, 10),
    };
    [lastX, lastY] = [x, y]; 
    return data;
  }

  function startDrawing(e: MouseEvent) {
    isDrawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
    
    // Create a "dummy" event to send on start 
    // This allows the server to create the action
    const startEventData: DrawEventData = {
      fromX: lastX,
      fromY: lastY,
      toX: lastX,
      toY: lastY,
      color: (currentTool === 'brush') ? colorPicker.value : CANVAS_BACKGROUND,
      lineWidth: parseInt(strokeWidth.value, 10),
    };
    
    //  Tell server we are starting a new action
    socket.emit('start-drawing', startEventData);
    
    //  Draw the first "dot" locally
    performDraw(startEventData);
  }

  function draw(e: MouseEvent) {
    if (!isDrawing) return;
    
    const drawData = getDrawData(e);

    // Draw locally for immediate feedback
    performDraw(drawData);

    //  Send the event packet to the server
    socket.emit('draw-event', drawData);
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    //  Tell server we finished
    socket.emit('stop-drawing');
  }


  // Socket Event Listeners 
  socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
  });
  
  socket.on('welcome', (data: { self: User, others: User[] }) => {
    selfUser = data.self; // Store our own details
    // Add all other users to the cursors map
    for (const user of data.others) {
      cursors.set(user.id, { x: 0, y: 0, color: user.color , name: user.name});
    }
    updateUserListUI(); // Update the UI
  });

  socket.on('new-user-connected', (user: User) => {
    console.log('New user connected:', user.id);
    cursors.set(user.id, { x: 0, y: 0, color: user.color, name: user.name });
    updateUserListUI();
  });
  
  socket.on('user-disconnected', (id: string) => {
    console.log('User disconnected:', id);
    cursors.delete(id); // Remove from map
    updateUserListUI();
    drawCursors(); // Redraw to remove their cursor
  });

  socket.on('cursor-move', (data: { id: string, x: number, y: number }) => {
    // Update the position in our map
    const cursor = cursors.get(data.id);
    if (cursor) {
      cursor.x = data.x;
      cursor.y = data.y;
      drawCursors(); // Redraw all cursors
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Loop through every action and every event and redraw
    for (const action of history) {
      for (const event of action.events) {
        performDraw(event);
      }
    }
  });

  /// --- Attach Local Listeners ---
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    socket.emit('cursor-move', { x: e.offsetX, y: e.offsetY });
    draw(e); 
  });
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', (e: MouseEvent) => {
    stopDrawing();
    // Also emit a final cursor move to update position
    socket.emit('cursor-move', { x: e.offsetX, y: e.offsetY }); 
  });
  
  
  undoButton.addEventListener('click', () => {
    socket.emit('undo');
  });
  
  redoButton.addEventListener('click', () => {
    socket.emit('redo');
  });
});
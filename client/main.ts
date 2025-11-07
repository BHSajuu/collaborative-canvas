import { DrawEventData, User, Cursor, Tool } from "./types.js";
import { performDraw } from "./canvas.js";
import { 
  emitStartDrawing, 
  emitDrawEvent, 
  emitStopDrawing, 
  emitCursorMove, 
  emitUndo, 
  emitRedo,
  registerSocketEvents 
} from "./websocket.js";

const CANVAS_BACKGROUND = '#FFFFFF';

window.addEventListener('load', () => {

  // Get UI Elements 
  const canvas = document.getElementById('drawing-canvas') as HTMLCanvasElement;
  const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
  const strokeWidth = document.getElementById('stroke-width') as HTMLInputElement;
  const strokeValue = document.getElementById('stroke-value') as HTMLSpanElement;
  const eraserTool = document.getElementById('eraser-tool') as HTMLButtonElement;
  const userList = document.getElementById('user-list') as HTMLUListElement;
  const undoButton = document.getElementById('undo-button') as HTMLButtonElement;
  const redoButton = document.getElementById('redo-button') as HTMLButtonElement;

 if (!canvas || !colorPicker || !strokeWidth || !strokeValue || !eraserTool || !userList || !undoButton || !redoButton) { 
    console.error('Failed to find one or more UI elements');
    return;
  }

  // Drawing state
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let currentTool: Tool = 'brush';
  let lastBrushColor = colorPicker.value;
  
  // Client State
  let selfUser: User | null = null;
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
    const startEventData: DrawEventData = {
      fromX: lastX,
      fromY: lastY,
      toX: lastX,
      toY: lastY,
      color: (currentTool === 'brush') ? colorPicker.value : CANVAS_BACKGROUND,
      lineWidth: parseInt(strokeWidth.value, 10),
    };
    
    //  Tell server we are starting a new action
    emitStartDrawing(startEventData);
    
    //  Draw the first "dot" locally
    performDraw(startEventData);
  }

  function draw(e: MouseEvent) {
    if (!isDrawing) return;
    
    const drawData = getDrawData(e);

    // Draw locally for immediate feedback
    performDraw(drawData);

    //  Send the event packet to the server
    emitDrawEvent(drawData);
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    //  Tell server we finished
    emitStopDrawing();
  }


  ///  Attach Local Listeners 
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    emitCursorMove(e.offsetX, e.offsetY);
    draw(e); 
  });
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', (e: MouseEvent) => {
    stopDrawing();
    // Also emit a final cursor move to update position
    emitCursorMove(e.offsetX, e.offsetY); 
  });
  
  
  undoButton.addEventListener('click', () => {
    emitUndo();
  });
  
  redoButton.addEventListener('click', () => {
    emitRedo();
  });


  //  Connect Modules 
  // We provide functions to websocket.ts so it can update main.ts's state.
  function setSelfUser(user: User) {
    selfUser = user;
  }
  function getCursors() {
    return cursors;
  }

  // Start listening for all server events
  registerSocketEvents(setSelfUser, getCursors, updateUserListUI);
});
import { DrawEventData, User, Cursor, Tool, DrawAction } from "./types.js";
import { ctx, canvas, cursorCanvas, cursorCtx, performDraw, performDrawRect } from "./canvas.js";
import { 
  emitStartDrawing, 
  emitDrawEvent, 
  emitStopDrawing, 
  emitCursorMove, 
  emitUndo, 
  emitRedo,
  registerSocketEvents,
  currentRoom,
  socket 
} from "./websocket.js";

const CANVAS_BACKGROUND = '#FFFFFF';

window.addEventListener('load', () => {
 
  // Get room display element 
  const roomNameDisplay = document.getElementById('room-name-display') as HTMLHeadingElement;
  if (roomNameDisplay) {
    roomNameDisplay.textContent = `Room: ${currentRoom}`;
  }

  // Get UI Elements 
  const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
  const strokeWidth = document.getElementById('stroke-width') as HTMLInputElement;
  const strokeValue = document.getElementById('stroke-value') as HTMLSpanElement;
  const eraserTool = document.getElementById('eraser-tool') as HTMLButtonElement;
  const rectTool = document.getElementById('rect-tool') as HTMLButtonElement; 
  const userList = document.getElementById('user-list') as HTMLUListElement;
  const undoButton = document.getElementById('undo-button') as HTMLButtonElement;
  const redoButton = document.getElementById('redo-button') as HTMLButtonElement;

 if (!canvas || !colorPicker || !strokeWidth || !strokeValue || !eraserTool || !rectTool || !userList || !undoButton || !redoButton) { 
    console.error('Failed to find one or more UI elements');
    return;
  }
  if (!ctx || !cursorCtx) {
    console.error('Canvas contexts not found');
    return;
  }

  // Client-Side State
  let localActionHistory: DrawAction[] = [];
  // This cache maps an Action ID to the canvas state after it was drawn
  let stateCache = new Map<string, ImageData>();
  const INITIAL_STATE_KEY = 'initial';  // Key for the blank canvas state
 
   // Drawing state
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let currentTool: Tool = 'brush';
  let lastBrushColor = colorPicker.value;
  
  // State for shape drawing
  let shapeStartX = 0;
  let shapeStartY = 0;
  
  let selfUser: User | null = null;
  const cursors = new Map<string, Cursor>();

  colorPicker.classList.add('active');

  // State Management Functions 
  /**
   * Clears canvas and redraws everything from the local history.
   * This is a slow function used for initialization and cache misses.
   * It also builds the state cache as it goes.
   */ 
   function buildCacheAndRedraw() {
    console.log('Building cache and redrawing...');
    if (!ctx) return;
     // Clear everything
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stateCache.clear();
    // Save the blank, initial state
    const initialState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    stateCache.set(INITIAL_STATE_KEY, initialState);
    
     // Loop and redraw, saving a snapshot after each action
    for (const action of localActionHistory) {
      if (action.events.length === 1 && action.events[0].tool === 'rectangle') {
        performDrawRect(action.events[0]);
      } else {
        // This is a brush stroke
        for (const event of action.events) {
          performDraw(event);
        }
      }
      const stateAfterAction = ctx.getImageData(0, 0, canvas.width, canvas.height);
      stateCache.set(action.id, stateAfterAction);
    }
  }

  /**
   * Called by websocket when a new user connects.
   */
  function setHistory(history: DrawAction[]) {
    localActionHistory = history;
    buildCacheAndRedraw();
  }
  
  /**
   * Called by websocket when any user finishes a stroke.
   */
  function addCommittedAction(action: DrawAction) {
    if(!ctx) return;
    const isShape = action.events.length === 1 && action.events[0].tool === 'rectangle';
    const senderId = action.id.split('-')[0]; 

    if (isShape && senderId !== socket.id) {
      performDrawRect(action.events[0]);
    }
    
    localActionHistory.push(action);
    const newState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    stateCache.set(action.id, newState);
  }
  
    /**
   * Called by websocket on 'perform-undo'.
   */
  function undoActionById(actionId: string) {
    if (!ctx) return;
    // Find and remove the action from local history
    localActionHistory = localActionHistory.filter(a => a.id !== actionId);
    // Get the ID of the previous action to restore
    const lastActionId = localActionHistory.length > 0 
      ? localActionHistory[localActionHistory.length - 1].id 
      : INITIAL_STATE_KEY;
    // Get the snapshot from our cache
    const stateToRestore = stateCache.get(lastActionId);
    if (stateToRestore) {
      // Restore it instantly
      console.log('Restoring from cache...');
      ctx.putImageData(stateToRestore, 0, 0);
    } else {
      // Cache miss (shouldn't happen, but good to have a fallback)
      console.warn('Cache miss on undo. Rebuilding...');
      buildCacheAndRedraw();
    }
  }

  /**
   * Called by websocket on 'perform-redo'.
   */
  function redoAction(action: DrawAction) {
    if (!ctx) return;
    //  Add the action back to our local history
    localActionHistory.push(action);
    // Find the state before this action
    const previousActionId = localActionHistory.length > 1
      ? localActionHistory[localActionHistory.length - 2].id
      : INITIAL_STATE_KEY;
    const prevState = stateCache.get(previousActionId);
    
    if (prevState) {
        // Restore the previous state
      ctx.putImageData(prevState, 0, 0);
      
      // Redraw only the redone action
      if (action.events.length === 1 && action.events[0].tool === 'rectangle') {
        performDrawRect(action.events[0]);
      } else {
        for (const event of action.events) {
          performDraw(event);
        }
      }
      
      // Save a new snapshot for this redone action
      const newState = ctx.getImageData(0, 0, canvas.width, canvas.height);
      stateCache.set(action.id, newState);
    } else {
      console.warn('Cache miss on redo. Rebuilding...');
      buildCacheAndRedraw();
    }
  }

  // UI Logic 
  
  strokeWidth.addEventListener('input', (e) => {
    strokeValue.textContent = (e.target as HTMLInputElement).value;
  });
  
  function setActiveTool(tool: Tool) {
    currentTool = tool;
    
    eraserTool.classList.remove('active');
    colorPicker.classList.remove('active');
    rectTool.classList.remove('active');

    if (tool === 'brush') {
      colorPicker.classList.add('active');
      colorPicker.value = lastBrushColor;
    } else if (tool === 'eraser') {
      eraserTool.classList.add('active');
    } else if (tool === 'rectangle') {
      rectTool.classList.add('active');
    }
  }
  colorPicker.addEventListener('input', () => {
    lastBrushColor = colorPicker.value;
    setActiveTool('brush');
  });
  colorPicker.addEventListener('click', () => {
    setActiveTool('brush');
  });
  eraserTool.addEventListener('click', () => {
    setActiveTool('eraser');
  });
  rectTool.addEventListener('click', () => { 
    setActiveTool('rectangle');
  });

  function updateUserListUI() {
    userList.innerHTML = ''; // Clear the list
    if (selfUser) {
      const selfLi = document.createElement('li');
      selfLi.innerHTML = `
        <div class="color-swatch" style="background-color: ${selfUser.color}"></div>
        <span>${selfUser.name} (You)</span>
      `;
      userList.appendChild(selfLi);
    }
    for (const [id, cursor] of cursors.entries()) {
      const otherLi = document.createElement('li');
      otherLi.innerHTML = `
        <div class="color-swatch" style="background-color: ${cursor.color}"></div>
        <span>${cursor.name}</span>
      `;
      userList.appendChild(otherLi);
    }
  }

  // Local Event Handlers
  /**
   * Creates a DrawEventData object from the current state.
   */
  function getDrawData(x: number, y: number, fromX = lastX, fromY = lastY): DrawEventData {
      let drawColor = (currentTool === 'brush') ? colorPicker.value : CANVAS_BACKGROUND;
      
      if (currentTool === 'rectangle') {
        drawColor = colorPicker.value;
      }
      
      const data: DrawEventData = {
        fromX: fromX,
        fromY: fromY,
        toX: x,
        toY: y,
        color: drawColor,
        lineWidth: parseInt(strokeWidth.value, 10),
        tool: currentTool, 
      };
      
      if (currentTool === 'brush' || currentTool === 'eraser') {
        [lastX, lastY] = [x, y];
      }
      return data;
  }
  
   /**
   * Starts a new drawing action at the given coordinates.
   */
  function startDrawing(x: number, y: number) {
    isDrawing = true;
    
    if (currentTool === 'brush' || currentTool === 'eraser') {
      [lastX, lastY] = [x, y];
      const startEventData = getDrawData(x, y, x, y);
      emitStartDrawing(startEventData);
      performDraw(startEventData);
    } else if (currentTool === 'rectangle') {
      shapeStartX = x;
      shapeStartY = y;
    }
  }
  
  /**
   * Continues a drawing action to the given coordinates.
   */
  function draw(x: number, y: number) {
    if (!isDrawing) return;
    
    if (currentTool === 'brush' || currentTool === 'eraser') {
      const drawData = getDrawData(x, y);
      performDraw(drawData);
      emitDrawEvent(drawData);
    } else if (currentTool === 'rectangle') {
      //  Draw a hollow, dashed preview
      if (!cursorCtx) return;
      cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
      
      const data = getDrawData(x, y, shapeStartX, shapeStartY);
      cursorCtx.strokeStyle = data.color; // Use strokeStyle
      cursorCtx.lineWidth = 1; // Always 1px for preview
      cursorCtx.setLineDash([5, 5]); // Make it dashed

      const width = data.toX - data.fromX;
      const height = data.toY - data.fromY;

      cursorCtx.beginPath();
      cursorCtx.rect(data.fromX, data.fromY, width, height);
      cursorCtx.stroke(); // Use stroke()
      cursorCtx.setLineDash([]); // Reset dash
    }
  }
  
  /**
   * Stops the current drawing action.
   */
  function stopDrawing(x: number, y: number) {
    if (!isDrawing) return;
    isDrawing = false;
    
    if (currentTool === 'brush' || currentTool === 'eraser') {
      emitStopDrawing();
    } else if (currentTool === 'rectangle') {
      if (!cursorCtx) return;
      cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
      
      // Get final shape data (with the correct stroke width)
      const shapeData = getDrawData(x, y, shapeStartX, shapeStartY);

      performDrawRect(shapeData);
      emitDrawShape(shapeData);
    }
  }

  // Shape Emitter 
  function emitDrawShape(data: DrawEventData) {
    socket.emit('draw-shape', data);
  }

 /**
   * Gets the x/y coordinates of a touch event relative to the canvas.
   */
  function getTouchCoords(e: TouchEvent): { x: number, y: number } | null {
    if (e.touches.length === 0) {
      if (e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      }
      return null;
    }
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    return { x, y };
  }

  function handleTouchStart(e: TouchEvent) {
    e.preventDefault();
    const coords = getTouchCoords(e);
    if (coords) {
      startDrawing(coords.x, coords.y);
    }
  }
  
  function handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    const coords = getTouchCoords(e);
    if (coords) {
      emitCursorMove(coords.x, coords.y);
      if (isDrawing) {
        draw(coords.x, coords.y);
      }
    }
  }
  
  function handleTouchEnd(e: TouchEvent) {
    e.preventDefault();
    const coords = getTouchCoords(e);
    if (isDrawing) {
      stopDrawing(coords?.x || lastX, coords?.y || lastY);
    }
  }
  
   // Attach Local Listeners
  
     // Touch Events
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd);
  canvas.addEventListener('touchcancel', handleTouchEnd); 
  
   // Mouse Events
  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    startDrawing(e.offsetX, e.offsetY);
  });
  
  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    emitCursorMove(e.offsetX, e.offsetY);
    if (isDrawing) {
      draw(e.offsetX, e.offsetY);
    }
  });

  canvas.addEventListener('mouseup', (e: MouseEvent) => {
    stopDrawing(e.offsetX, e.offsetY);
  });
  canvas.addEventListener('mouseout', (e: MouseEvent) => {
    if (isDrawing) {
      stopDrawing(e.offsetX, e.offsetY);
    }
  });
  
  // Button Events 
  undoButton.addEventListener('click', () => { emitUndo(); });
  redoButton.addEventListener('click', () => { emitRedo(); });

  // Connect Modules 
  function setSelfUser(user: User) { selfUser = user; }
  function getCursors() { return cursors; }

  registerSocketEvents(
    setSelfUser, 
    getCursors, 
    updateUserListUI,
    setHistory,
    addCommittedAction,
    undoActionById,
    redoAction
  );
 // Save the initial blank state
  buildCacheAndRedraw();
});
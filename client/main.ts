import { DrawEventData, User, Cursor, Tool, DrawAction } from "./types.js";
import { ctx, canvas, performDraw } from "./canvas.js"; 
import { 
  emitStartDrawing, 
  emitDrawEvent, 
  emitStopDrawing, 
  emitCursorMove, 
  emitUndo, 
  emitRedo,
  registerSocketEvents,
  currentRoom
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
  const userList = document.getElementById('user-list') as HTMLUListElement;
  const undoButton = document.getElementById('undo-button') as HTMLButtonElement;
  const redoButton = document.getElementById('redo-button') as HTMLButtonElement;

 if (!canvas || !colorPicker || !strokeWidth || !strokeValue || !eraserTool || !userList || !undoButton || !redoButton) { 
    console.error('Failed to find one or more UI elements');
    return;
  }
  if (!ctx) {
    console.error('Canvas context not found');
    return;
  }

  // client state
  let localActionHistory: DrawAction[] = [];
  // This cache maps an Action ID to the canvas state after it was drawn
  let stateCache = new Map<string, ImageData>();
  const INITIAL_STATE_KEY = 'initial'; // Key for the blank canvas state

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

  //  STATE MANAGEMENT FUNCTIONS -
  /**
   * Clears canvas and redraws everything from the local history.
   * This is a slow function used for initialization and cache misses.
   * It also builds the state cache as it goes.
   */
  function buildCacheAndRedraw() {
    console.log('Building cache and redrawing...');
    if (!ctx) return;

    // 1. Clear everything
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stateCache.clear();

    // 2. Save the blank, initial state
    const initialState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    stateCache.set(INITIAL_STATE_KEY, initialState);

    // 3. Loop and redraw, saving a snapshot after *each action*
    for (const action of localActionHistory) {
      for (const event of action.events) {
        performDraw(event);
      }
      // Save the state of the canvas *after* this action
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
    if (!ctx) return;
    // The drawing already happened live, so just add to history
    localActionHistory.push(action);
    // Save a new snapshot
    const newState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    stateCache.set(action.id, newState);
  }

  /**
   * Called by websocket on 'perform-undo'.
   */
  function undoActionById(actionId: string) {
    if (!ctx) return;
    
    // 1. Find and remove the action from local history
    localActionHistory = localActionHistory.filter(a => a.id !== actionId);
    
    // 2. Get the ID of the *previous* action to restore
    const lastActionId = localActionHistory.length > 0 
      ? localActionHistory[localActionHistory.length - 1].id 
      : INITIAL_STATE_KEY;

    // 3. Get the snapshot from our cache
    const stateToRestore = stateCache.get(lastActionId);
    
    if (stateToRestore) {
      // 4. Restore it instantly
      console.log('Restoring from cache...');
      ctx.putImageData(stateToRestore, 0, 0);
    } else {
      // 5. Cache miss (shouldn't happen, but good to have a fallback)
      console.warn('Cache miss on undo. Rebuilding...');
      buildCacheAndRedraw();
    }
  }

  /**
   * Called by websocket on 'perform-redo'.
   */
  function redoAction(action: DrawAction) {
    if (!ctx) return;

    // 1. Add the action back to our local history
    localActionHistory.push(action);

    // 2. Find the state *before* this action
    const previousActionId = localActionHistory.length > 1
      ? localActionHistory[localActionHistory.length - 2].id
      : INITIAL_STATE_KEY;
    
    const prevState = stateCache.get(previousActionId);
    
    if (prevState) {
      // 3. Restore the previous state
      ctx.putImageData(prevState, 0, 0);
      
      // 4. Redraw only the redone action
      for (const event of action.events) {
        performDraw(event);
      }
      
      // 5. Save a new snapshot for this redone action
      const newState = ctx.getImageData(0, 0, canvas.width, canvas.height);
      stateCache.set(action.id, newState);

    } else {
      // 6. Cache miss
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
    if (tool === 'brush') {
      eraserTool.classList.remove('active');
      colorPicker.classList.add('active');
      colorPicker.value = lastBrushColor;
    } else if (tool === 'eraser') {
      colorPicker.classList.remove('active');
      eraserTool.classList.add('active');
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

  //  Local Event Handlers
  /**
   * Creates a DrawEventData object from the current state.
   */
 function getDrawData(x: number, y: number): DrawEventData {
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

  /**
   * Starts a new drawing action at the given coordinates.
   */
  function startDrawing(x: number, y: number) {
    isDrawing = true;
    [lastX, lastY] = [x, y];
    
    const startEventData: DrawEventData = {
      fromX: lastX,
      fromY: lastY,
      toX: lastX,
      toY: lastY,
      color: (currentTool === 'brush') ? colorPicker.value : CANVAS_BACKGROUND,
      lineWidth: parseInt(strokeWidth.value, 10),
    };
    
    emitStartDrawing(startEventData);
    performDraw(startEventData);
  }

 /**
   * Continues a drawing action to the given coordinates.
   */
  function draw(x: number, y: number) {
    if (!isDrawing) return;
    
    const drawData = getDrawData(x, y);
    performDraw(drawData);
    emitDrawEvent(drawData);
  }

  /**
   * Stops the current drawing action.
   */
  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    emitStopDrawing();
  }
  
  /**
   * Gets the x/y coordinates of a touch event relative to the canvas.
   */
  function getTouchCoords(e: TouchEvent): { x: number, y: number } | null {
    if (e.touches.length === 0) {
      return null;
    }
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    return { x, y };
  }

  //  ouch Event Handlers
  function handleTouchStart(e: TouchEvent) {
    // Prevent page scrolling while drawing
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
      // Also emit cursor move for touch
      emitCursorMove(coords.x, coords.y);
      draw(coords.x, coords.y);
    }
  }
  
  function handleTouchEnd(e: TouchEvent) {
    e.preventDefault();
    stopDrawing();
  }

  // Attach Local Listeners

  // Mouse Events
  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    startDrawing(e.offsetX, e.offsetY);
  });
  
  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    emitCursorMove(e.offsetX, e.offsetY);
    // We only call draw() if isDrawing is true
    if (isDrawing) {
      draw(e.offsetX, e.offsetY);
    }
  });

  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing); // Treat mouseout as stop
  
  // Touch Events
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd);
  canvas.addEventListener('touchcancel', handleTouchEnd); // Treat cancel as end


  // Button Events 
  undoButton.addEventListener('click', () => {
    emitUndo();
  });
  
  redoButton.addEventListener('click', () => {
    emitRedo();
  });


  // Connect Modules
  function setSelfUser(user: User) {
    selfUser = user;
  }
  function getCursors() {
    return cursors;
  }

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
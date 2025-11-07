/// <reference types="socket.io-client" />


interface DrawEventData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  lineWidth: number;
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

  if (!canvas || !colorPicker || !strokeWidth || !strokeValue || !eraserTool) {
    console.error('Failed to find one or more UI elements');
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Failed to get 2D context');
    return;
  }

  // Set canvas size
  canvas.width = 800;
  canvas.height = 600;

  // Drawing state
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
 
  let currentTool: Tool = 'brush';
  let lastBrushColor = colorPicker.value;
  
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

  //  Local Event Handlers 
  function startDrawing(e: MouseEvent) {
    isDrawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
  }

  function draw(e: MouseEvent) {
    if (!isDrawing) return;
    
    const x = e.offsetX;
    const y = e.offsetY;
    
    // Determine color based on tool
    let drawColor: string;
    if (currentTool === 'brush') {
      drawColor = colorPicker.value;
    } else {
      drawColor = CANVAS_BACKGROUND; 
    }

    // 1. Create the data packet
    const drawData: DrawEventData = {
      fromX: lastX,
      fromY: lastY,
      toX: x,
      toY: y,
      color: drawColor,
      lineWidth: parseInt(strokeWidth.value, 10),
    };

    // 2. Draw locally for immediate feedback
    performDraw(drawData);

    // 3. Send the data packet to the server
    socket.emit('draw-event', drawData);

    // Update last position
    [lastX, lastY] = [x, y];
  }

  function stopDrawing() {
    isDrawing = false;
  }
 
  // Listen for the complete history from the server
  socket.on('load-history', (history: DrawEventData[]) => {
    console.log(`Received history with ${history.length} events`);
    // Draw every event in the history
    for (const data of history) {
      performDraw(data);
    }
  });

 
  // Listen for drawing events from other users
  socket.on('draw-event', (data: DrawEventData) => {
    console.log('Received draw event from server');
    performDraw(data);
  });

  //  Attach Local Listeners 
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
});
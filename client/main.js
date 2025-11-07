// This will be client/main.ts, but we'll use JS for simplicity in Step 1
window.addEventListener('load', () => {
  // Connect to the server (though we don't use it yet)
  const socket = io();
  socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
  });

  const canvas = document.getElementById('drawing-canvas');
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    console.error('Failed to find canvas element');
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

  //  Drawing Functions
  function startDrawing(e) {
    isDrawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
  }

  function draw(e) {
    if (!isDrawing) return;
    
    const x = e.offsetX;
    const y = e.offsetY;

    // Set line properties (for now)
    ctx.strokeStyle = '#000000'; // black
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw the line
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    // Update last position
    [lastX, lastY] = [x, y];
  }

  function stopDrawing() {
    isDrawing = false;
  }

  // --- Event Listeners ---
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);

});
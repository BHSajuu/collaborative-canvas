"use strict";
/// <reference types="socket.io-client" />
const CANVAS_BACKGROUND = '#FFFFFF';
window.addEventListener('load', () => {
    const socket = io();
    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
    });
    // Get UI Elements 
    const canvas = document.getElementById('drawing-canvas');
    const colorPicker = document.getElementById('color-picker');
    const strokeWidth = document.getElementById('stroke-width');
    const strokeValue = document.getElementById('stroke-value');
    const eraserTool = document.getElementById('eraser-tool');
    const cursorCanvas = document.getElementById('cursor-canvas');
    const userList = document.getElementById('user-list');
    if (!canvas || !colorPicker || !strokeWidth || !strokeValue || !eraserTool || !cursorCanvas || !userList) {
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
    let currentTool = 'brush';
    let lastBrushColor = colorPicker.value;
    // Client State
    let selfUser = null;
    // Stores the state of all other users' cursors
    const cursors = new Map();
    colorPicker.classList.add('active');
    // Update stroke width display
    strokeWidth.addEventListener('input', (e) => {
        strokeValue.textContent = e.target.value;
    });
    // Tool Switching Logic
    function setActiveTool(tool) {
        currentTool = tool;
        if (tool === 'brush') {
            eraserTool.classList.remove('active');
            colorPicker.classList.add('active');
            colorPicker.value = lastBrushColor;
        }
        else if (tool === 'eraser') {
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
    function performDraw(data) {
        if (!ctx)
            return;
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
        if (!cursorCtx)
            return;
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
    function startDrawing(e) {
        isDrawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }
    function draw(e) {
        if (!isDrawing)
            return;
        const x = e.offsetX;
        const y = e.offsetY;
        // Determine color based on tool
        let drawColor = (currentTool === 'brush') ? colorPicker.value : CANVAS_BACKGROUND;
        // 1. Create the data packet
        const drawData = {
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
    // Socket Event Listeners 
    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
    });
    socket.on('welcome', (data) => {
        selfUser = data.self; // Store our own details
        // Add all other users to the cursors map
        for (const user of data.others) {
            cursors.set(user.id, { x: 0, y: 0, color: user.color, name: user.name });
        }
        updateUserListUI(); // Update the UI
    });
    socket.on('new-user-connected', (user) => {
        console.log('New user connected:', user.id);
        cursors.set(user.id, { x: 0, y: 0, color: user.color, name: user.name });
        updateUserListUI();
    });
    socket.on('user-disconnected', (id) => {
        console.log('User disconnected:', id);
        cursors.delete(id); // Remove from map
        updateUserListUI();
        drawCursors(); // Redraw to remove their cursor
    });
    socket.on('cursor-move', (data) => {
        // Update the position in our map
        const cursor = cursors.get(data.id);
        if (cursor) {
            cursor.x = data.x;
            cursor.y = data.y;
            drawCursors(); // Redraw all cursors
        }
    });
    // Listen for the complete history from the server
    socket.on('load-history', (history) => {
        console.log(`Received history with ${history.length} events`);
        // Draw every event in the history
        for (const data of history) {
            performDraw(data);
        }
    });
    // Listen for drawing events from other users
    socket.on('draw-event', (data) => {
        console.log('Received draw event from server');
        performDraw(data);
    });
    //  Attach Local Listeners 
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', (e) => {
        // Always emit cursor move
        socket.emit('cursor-move', { x: e.offsetX, y: e.offsetY });
        // Only draw if mouse is down
        draw(e);
    });
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
});

"use strict";
/// <reference types="socket.io-client" />
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
    if (!canvas || !colorPicker || !strokeWidth || !strokeValue) {
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
    // Update stroke width display
    strokeWidth.addEventListener('input', (e) => {
        strokeValue.textContent = e.target.value;
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
        // 1. Create the data packet
        const drawData = {
            fromX: lastX,
            fromY: lastY,
            toX: x,
            toY: y,
            color: colorPicker.value,
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
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
});

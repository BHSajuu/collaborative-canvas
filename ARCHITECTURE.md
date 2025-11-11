# Architecture & Design Decisions

This document outlines the high-level architecture of the Collaborative Canvas application, focusing on data flow, real-time protocol, and key design decisions.

## 1. Data Flow Diagram (Drawing a Line)

The following diagram illustrates the flow of a single drawing event from one user (Client A) to another (Client B).

```mermaid
sequenceDiagram
    participant ClientA as Client A (Browser)
    participant Server as Node.js Server (Socket.io)
    participant ClientB as Client B (Browser)

    par [Client A Draws]
        ClientA->>+ClientA: MouseDown (startDrawing)
        ClientA->>+Server: emit('start-drawing', eventData)
        Server->>+ClientB: emit('draw-event', eventData)
        ClientB->>+ClientB: performDraw(eventData)

        ClientA->>+ClientA: MouseMove (draw)
        ClientA->>+Server: emit('draw-event', eventData)
        Server->>+ClientB: emit('draw-event', eventData)
        ClientB->>+ClientB: performDraw(eventData)

        ClientA->>+ClientA: MouseUp (stopDrawing)
        ClientA->>+Server: emit('stop-drawing')
    end

    par [Server Commits Action]
        Server->>+Server: stopUserAction(ClientA_ID)
        Server-->>-Server: action = buildDrawAction()
        Server->>+Server: persist(action)
        
        Note over Server: (Clears redoStack)

        Server-->>ClientA: emit('action-committed', action)
        Server-->>ClientB: emit('action-committed', action)

        ClientA->>+ClientA: addCommittedAction(action)
        ClientB->>+ClientB: addCommittedAction(action)
    end

This describes the flow of data when a user (User A) draws a brush stroke.

1.  **`mousedown` (User A):**
    * `client/main.ts` captures the event.
    * `emitStartDrawing()` sends a `start-drawing` event to the server. This event includes the starting coordinates and tool settings.
    * The server receives `start-drawing`, creates an `activeAction` in `drawing-state.ts`, and broadcasts the first `draw-event` to other clients in the room.
    * `performDraw()` is called *locally* for User A for immediate responsiveness.

2.  **`mousemove` (User A):**
    * `client/main.ts` captures the move.
    * `performDraw()` is called *locally* for User A.
    * `emitDrawEvent()` sends a `draw-event` to the server.
    * `server/server.ts` receives the `draw-event` and broadcasts it to all *other* clients in the room.
    * Other clients (`client/websocket.ts`) receive the `draw-event` and call `performDraw()` to render the segment.

3.  **`mouseup` (User A):**
    * `client/main.ts` captures the event.
    * `emitStopDrawing()` sends a `stop-drawing` event to the server.
    * `server/server.ts` receives `stop-drawing` and calls `stopUserAction()` in `drawing-state.ts`.
    * `drawing-state.ts` moves the `activeAction` (which contains all segments from the stroke) into the permanent `actionHistory`.
    * The `redoStack` is cleared.
    * The *entire* action (`DrawAction`) is saved to Vercel KV for persistence.
    * The server broadcasts an `action-committed` event to *all* clients (including User A).

4.  **Action Committal (All Clients):**
    * All clients (`client/main.ts`) receive the `action-committed` event.
    * They call `addCommittedAction()`, which pushes the complete action to their `localActionHistory`.
    * Crucially, they take a snapshot of the canvas (`ctx.getImageData`) and store it in the `stateCache` map, keyed by the action's ID. This is vital for the undo/redo feature.

## 2. WebSocket Protocol (Socket.io)

### Client → Server
* `connection`: Client connects with the `room` name in the query.
* `start-drawing (data: DrawEventData)`: Sent on `mousedown`.
* `draw-event (data: DrawEventData)`: Sent on `mousemove` while drawing.
* `stop-drawing`: Sent on `mouseup` to finalize a brush stroke.
* `draw-shape (data: DrawEventData)`: Sent on `mouseup` when using the rectangle tool. Commits the shape as a single action.
* `undo`: Sent when the user clicks the undo button.
* `redo`: Sent when the user clicks the redo button.
* `clear-canvas`: Sent when the user clicks the clear button.
* `cursor-move (data: {x, y})`: Sent on *any* `mousemove` (even without drawing) to update the live cursor position.

### Server → Client
* `welcome (data: {self, others})`: Sent to a new user upon joining, providing their own user object and a list of other users in the room.
* `new-user-connected (user: User)`: Broadcast to all other clients when a new user joins.
* `user-disconnected (id: string)`: Broadcast when a user disconnects.
* `draw-event (data: DrawEventData)`: Broadcast to other clients to render live drawing segments.
* `global-redraw (history: DrawAction[])`: Sent only to a newly connecting user. Provides the entire drawing history for the room, which the client then re-renders.
* `action-committed (action: DrawAction)`: Broadcast to *all* clients (including the sender) when an action (stroke or shape) is finalized and added to the history.
* `perform-undo (actionId: string)`: Broadcast to all clients when an undo is performed. The client uses this ID to revert to the previous state.
* `perform-redo (action: DrawAction)`: Broadcast to all clients when a redo is performed. The client uses this to re-apply the given action.
* `perform-clear`: Broadcast to all clients to clear their canvas and local history.
* `cursor-move (data: {id, x, y})`: Broadcast to other clients to update a specific user's cursor position.

## 3. Undo/Redo Strategy

This is a two-part system: a server-side "source of truth" and a client-side "performance cache."

### Server-Side (State Authority)
* The `server/drawing-state.ts` file maintains the authoritative state for each room.
* It uses two arrays: `actionHistory: DrawAction[]` and `redoStack: DrawAction[]`.
* **On `undo`:** The server pops the last action from `actionHistory` and pushes it onto the `redoStack`. It then broadcasts `perform-undo` with the ID of the undone action.
* **On `redo`:** The server pops the last action from `redoStack` and pushes it onto `actionHistory`. It then broadcasts `perform-redo` with the complete action data.
* **On New Action:** When any new action is committed (`stopUserAction` or `commitShapeAction`), the `redoStack` is cleared. This is standard behavior.
* This entire state (`actionHistory` and `redoStack`) is saved to Vercel KV on every change, providing persistence.

### Client-Side (Performance & Caching)
* The client *does not* re-render the entire history on an undo/redo. This would be extremely slow.
* `client/main.ts` maintains a `stateCache = new Map<string, ImageData>()`.
* This cache stores a full `ImageData` snapshot of the canvas *after* each action was completed (keyed by the action's ID).
* **On `perform-undo (actionId)`:** The client finds the action in its `localActionHistory` and *removes* it. It then gets the ID of the *new* last action (or an "initial" key for a blank canvas). It retrieves the `ImageData` for that previous state from the `stateCache` and uses `ctx.putImageData()` to instantly restore the canvas. This is an O(1) operation.
* **On `perform-redo (action)`:** The client adds the action back to its `localActionHistory`. It then re-draws *only* that single action and saves a new `ImageData` snapshot into the `stateCache`.

This architecture provides the consistency of a server-authoritative state with the high performance of client-side snapshot caching.

## 4. Performance Decisions

1.  **Dual-Canvas System:** As noted in the `README`, the application uses two canvases stacked on top of each other.
    * `#drawing-canvas` (bottom): For the persistent drawing. It is only drawn to and never cleared (except on a "Clear" or "Undo" event).
    * `#cursor-canvas` (top): For live cursors and shape previews. This canvas is cleared and redrawn many times per second (`cursorCtx.clearRect`).
    * This separation is critical. It prevents the entire canvas from needing to be redrawn just to move a cursor, which would be a major performance bottleneck.

2.  **Client-Side Snapshot Caching:** The `ImageData` cache for undo/redo is the single most important performance decision for that feature. It avoids re-playing the entire drawing history.

3.  **Local Draw Responsiveness:** When a user draws, their own `performDraw()` is called *immediately* in `client/main.ts` before any network request. This ensures a "zero-latency" feel for the user doing the drawing. The server-broadcasted event is for all *other* clients.

4.  **Non-Destructive Shape Previews:** When drawing a rectangle, the preview is drawn on the `#cursor-canvas`. This allows the user to see the shape without "damaging" the main drawing underneath. The final shape is only drawn on the `#drawing-canvas` on `mouseup`.

## 5. Conflict Resolution

* **Strategy:** Server-Authoritative Event Stream (or "Last Write Wins").
* **Drawing:** For simultaneous drawing events, the server simply acts as a message bus, broadcasting events as it receives them. Whichever `draw-event` is processed last "wins" for that set of pixels.
* **History:** The authoritative *history* is determined by the order in which the server receives the `stop-drawing` or `draw-shape` events.
* This is a simple but effective strategy that ensures all clients eventually reach a consistent state, as the server is the single source of truth for the historical order of actions. More complex strategies like Operational Transformation (OT) or CRDTs were not necessary for this project's requirements.
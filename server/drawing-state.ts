import { createClient } from "@vercel/kv";


export interface DrawEventData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  lineWidth: number;
}

// Action-based History
// A "DrawAction" is a single stroke (mousedown to mouseup)
// It contains all the small segments that make it up.
export interface DrawAction {
  id: string;
  events: DrawEventData[];
}


// Define the state for a single room
interface RoomState {
  actionHistory: DrawAction[];
  redoStack: DrawAction[];
  activeActions: Map<string, DrawAction>;
}

// KV Client Setup 
const kv = createClient({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Persistence Setup 
function getRoomKey(roomName: string): string {
  // Sanitize roomName to prevent injection issues
  const safeRoomName = roomName.replace(/[^a-z0-9_-]/gi, '_');
  return `room:${safeRoomName}`;
}

const roomStates = new Map<string, RoomState>();

// State Management Functions

/**
 * Saves a room's state (history and redo stack) to Vercel KV.
 */
async function saveRoomState(roomName: string, state: RoomState) {
  try {
    const key = getRoomKey(roomName);
    const stateToSave = {
      actionHistory: state.actionHistory,
      redoStack: state.redoStack,
    };
    // 'set' is async, so we await it
    await kv.set(key, stateToSave);
    console.log(`Saved state for room: ${roomName}`);
  } catch (err) {
    console.error(`Failed to save state for room ${roomName}:`, err);
  }
}

/**
 * Loads a room's state from Vercel KV.
 * Returns a new RoomState object or null if no data exists.
 */
async function loadRoomState(roomName: string): Promise<RoomState | null> {
  try {
    const key = getRoomKey(roomName);
    
    const loadedData = (await kv.get(key)) as {
      actionHistory: DrawAction[];
      redoStack: DrawAction[];
    } | null;

    if (loadedData) {
      console.log(`Loaded state for room: ${roomName}`);
      return {
        actionHistory: loadedData.actionHistory || [],
        redoStack: loadedData.redoStack || [],
        activeActions: new Map<string, DrawAction>(),
      };
    }
  } catch (err) {
    console.error(`Failed to load state for room ${roomName}:`, err);
  }
  return null;
}

/**
 * Helper function to get the state for a room,
 * or create it if it doesn't exist.
 */
async function getRoomState(roomName: string): Promise<RoomState> {
  if (roomStates.has(roomName)) {
    return roomStates.get(roomName)!;
  }

  const loadedState = await loadRoomState(roomName);
  if (loadedState) {
    roomStates.set(roomName, loadedState);
    return loadedState;
  }

  const newState: RoomState = {
    actionHistory: [],
    redoStack: [],
    activeActions: new Map<string, DrawAction>(),
  };
  roomStates.set(roomName, newState);
  return newState;
}

/**
 * Creates a new, active drawing action for a user.
 */
export async function startUserAction(roomName: string, socketId: string, startEvent: DrawEventData) {
  const state = await getRoomState(roomName); 
  const newAction: DrawAction = {
    id: `${socketId}-${Date.now()}`,
    events: [startEvent],
  };
  state.activeActions.set(socketId, newAction);
}

/**
 * Moves a user's active action into the permanent history.
 * This clears the redo stack.
 * @returns The DrawAction that was just committed.
 */
export async function stopUserAction(roomName: string, socketId: string): Promise<DrawAction | undefined> {
  const state = await getRoomState(roomName); 
  const action = state.activeActions.get(socketId);
  if (action) {
    state.actionHistory.push(action);
    state.activeActions.delete(socketId);
    state.redoStack.length = 0;
    await saveRoomState(roomName, state);  
    return action;
  }
  return undefined;
}

/**
 * Adds a drawing segment (event) to a user's currently active action.
 */
export async function addUserEvent(roomName: string, socketId: string, data: DrawEventData) {
  const state = await getRoomState(roomName); 
  const action = state.activeActions.get(socketId);
  if (action) {
    action.events.push(data);
  }
}

/**
 * Moves the last action from history to the redo stack.
 * @returns The action that was undone, or undefined if history was empty.
 */
export async function performUndo(roomName: string): Promise<DrawAction | undefined> {
  const state = await getRoomState(roomName); 
  if (state.actionHistory.length > 0) {
    const actionToUndo = state.actionHistory.pop()!;
    state.redoStack.push(actionToUndo);
    await saveRoomState(roomName, state);  
    return actionToUndo;
  }
  return undefined;
}

/**
 * Moves the last undone action from the redo stack back to history.
 * @returns The action that was redone, or undefined if the stack was empty.
 */
export async function performRedo(roomName: string): Promise<DrawAction | undefined> {
  const state = await getRoomState(roomName); 
  if (state.redoStack.length > 0) {
    const actionToRedo = state.redoStack.pop()!;
    state.actionHistory.push(actionToRedo);
    await saveRoomState(roomName, state);  
    return actionToRedo;
  }
  return undefined;
}

/**
 * Gets the complete, current history of actions.
 */
export async function getActionHistory(roomName: string): Promise<DrawAction[]> {
  const state = await getRoomState(roomName); 
  return state.actionHistory;
}

// Function to remove a user's active action if they disconnect mid-draw
export function clearActiveAction(socketId: string) {
  // We have to check all rooms, as we don't know which room the user was in
  // when they disconnected
  for (const state of roomStates.values()) {
    if (state.activeActions.has(socketId)) {
      state.activeActions.delete(socketId);
      break;
    }
  }
}
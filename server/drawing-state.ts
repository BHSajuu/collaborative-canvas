
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

// Store all room states in a Map
const roomStates = new Map<string, RoomState>();

// State Management Functions
/**
 * Helper function to get the state for a room,
 * or create it if it doesn't exist.
 */
function getRoomState(roomName: string): RoomState {
  if (!roomStates.has(roomName)) {
    // Create a new, blank state for this room
    roomStates.set(roomName, {
      actionHistory: [],
      redoStack: [],
      activeActions: new Map<string, DrawAction>(),
    });
  }
  return roomStates.get(roomName)!;
}

/**
 * Creates a new, active drawing action for a user.
 */
export function startUserAction(roomName: string, socketId: string, startEvent: DrawEventData) {
  const state = getRoomState(roomName);
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
export function stopUserAction(roomName: string, socketId: string): DrawAction | undefined {
  const state = getRoomState(roomName);
  const action = state.activeActions.get(socketId);
  if (action) {
    state.actionHistory.push(action);
    state.activeActions.delete(socketId);
    state.redoStack.length = 0; // Clear redo stack for this room
    return action;
  }
  return undefined;
}

/**
 * Adds a drawing segment (event) to a user's currently active action.
 */
export function addUserEvent(roomName: string, socketId: string, data: DrawEventData) {
  const state = getRoomState(roomName);
  const action = state.activeActions.get(socketId);
  if (action) {
    action.events.push(data);
  }
}

/**
 * Moves the last action from history to the redo stack.
 * @returns The action that was undone, or undefined if history was empty.
 */
export function performUndo(roomName: string): DrawAction | undefined {
  const state = getRoomState(roomName);
  if (state.actionHistory.length > 0) {
    const actionToUndo = state.actionHistory.pop()!;
    state.redoStack.push(actionToUndo);
    return actionToUndo;
  }
  return undefined;
}

/**
 * Moves the last undone action from the redo stack back to history.
 * @returns The action that was redone, or undefined if the stack was empty.
 */
export function performRedo(roomName: string): DrawAction | undefined {
  const state = getRoomState(roomName);
  if (state.redoStack.length > 0) {
    const actionToRedo = state.redoStack.pop()!;
    state.actionHistory.push(actionToRedo);
    return actionToRedo;
  }
  return undefined;
}

/**
 * Gets the complete, current history of actions.
 */
export function getActionHistory(roomName: string): DrawAction[] {
  const state = getRoomState(roomName);
  return state.actionHistory;
}

// Function to remove a user's active action if they disconnect mid-draw
export function clearActiveAction(socketId: string) {
  // We have to check all rooms, as we don't know which room the user was in
  for (const state of roomStates.values()) {
    if (state.activeActions.has(socketId)) {
      state.activeActions.delete(socketId);
      break;
    }
  }
}
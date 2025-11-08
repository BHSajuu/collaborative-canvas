

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

// Server State
const actionHistory: DrawAction[] = [];
const redoStack: DrawAction[] = [];
const activeActions = new Map<string, DrawAction>();


// State Management Functions
/**
 * Creates a new, active drawing action for a user.
 */
export function startUserAction(socketId: string, startEvent: DrawEventData) {
  const newAction: DrawAction = {
    id: `${socketId}-${Date.now()}`,
    events: [startEvent], // Start the action with its first event
  };
  activeActions.set(socketId, newAction);
}

/**
 * Moves a user's active action into the permanent history.
 * This clears the redo stack.
 * @returns The DrawAction that was just committed.
 */
export function stopUserAction(socketId: string) {
  const action = activeActions.get(socketId);
  if (action) {
    // Move from "active" to "history"
    actionHistory.push(action);
    activeActions.delete(socketId);
    
    // Clear the redo stack, since a new action breaks the redo chain
    redoStack.length = 0;
    return action;
  }
}

/**
 * Adds a drawing segment (event) to a user's currently active action.
 */
export function addUserEvent(socketId: string, data: DrawEventData) {
  const action = activeActions.get(socketId);
  if (action) {
    action.events.push(data);
  }
}

/**
 * Moves the last action from history to the redo stack.
 * @returns The action that was undone, or undefined if history was empty.
 */
export function performUndo(): DrawAction | undefined {
  if (actionHistory.length > 0) {
    const actionToUndo = actionHistory.pop()!;
    redoStack.push(actionToUndo);
    return actionToUndo;
  }
  return undefined;
}

/**
 * Moves the last undone action from the redo stack back to history.
 * @returns The action that was redone, or undefined if the stack was empty.
 */
export function performRedo(): DrawAction | undefined {
  if (redoStack.length > 0) {
    const actionToRedo = redoStack.pop()!;
    actionHistory.push(actionToRedo);
    return actionToRedo;
  }
  return undefined;
}

/**
 * Gets the complete, current history of actions.
 */
export function getActionHistory(): DrawAction[] {
  return actionHistory;
}
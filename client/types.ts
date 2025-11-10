export interface DrawEventData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  lineWidth: number;
  tool?: Tool;
}

export interface DrawAction {
  id: string;
  events: DrawEventData[];
}

export interface User {
  id: string;
  color: string;
  name: string;
}
export interface Cursor {
  x: number;
  y: number;
  color: string;
  name: string;
}

export type Tool = 'brush' | 'eraser' | 'rectangle';
// Live text remains text until an explicit outline/conversion operation.
export interface NGText {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  italic: boolean;
  layout: 'display' | 'body' | 'path';
  pathId?: string;
}

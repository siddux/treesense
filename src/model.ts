export interface BehaviorTreeNode {
  /** The tree’s own ID, if present */
  '@_ID'?: string;
  /**
   * Other properties:
   * - attributes will be strings
   * - child tags will be BehaviorTreeNode or BehaviorTreeNode[]
   */
  [key: string]: string|BehaviorTreeNode|BehaviorTreeNode[]|undefined;
}

export function isBTNode(obj: any): obj is BehaviorTreeNode {
  return !!obj && typeof obj === 'object' && typeof obj['@_ID'] === 'string';
}

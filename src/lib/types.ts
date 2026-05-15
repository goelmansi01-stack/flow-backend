// Workflow definition types — the shape stored in workflow.draftDefinition
// and workflow_versions.definition

export type NodeType = 'http_request' | 'condition' | 'delay' | 'notify';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  config: HttpNodeConfig | ConditionNodeConfig | DelayNodeConfig | NotifyNodeConfig;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  condition?: 'true' | 'false'; // for condition node branches
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggerNodeId: string; // which node is the entry point
}

// Node configuration shapes

export interface HttpNodeConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface ConditionNodeConfig {
  jsonPath: string;   // e.g. "$.status"
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists';
  value: unknown;
}

export interface DelayNodeConfig {
  delaySeconds: number;
}

export type NotifyChannel = 'email' | 'slack';

export interface NotifyNodeConfig {
  channel: NotifyChannel;
  to?: string;       // email recipient
  subject?: string;  // email subject
  message: string;
}

// Execution context passed to each handler

export interface ExecutionContext {
  runId: string;
  nodeId: string;
  attempt: number;
  triggerPayload: Record<string, unknown> | null;
  nodeOutputs: Record<string, unknown>; // outputs from prior nodes keyed by nodeId
}

// AppError for consistent error handling

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

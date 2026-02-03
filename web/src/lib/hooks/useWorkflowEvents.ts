/**
 * Hook for real-time workflow events via WebSocket.
 *
 * Provides workflow execution updates (started, completed, failed, step progress).
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth';
import { fetchAuthSession } from 'aws-amplify/auth';

const WS_URL = import.meta.env.VITE_WS_URL || '';

export type WorkflowEventType =
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'workflow.paused'
  | 'step.started'
  | 'step.completed'
  | 'step.failed'
  | 'step.skipped'
  | 'node.executing'
  | 'node.completed'
  | 'node.failed';

export interface WorkflowEvent {
  action: 'workflow_event';
  event: WorkflowEventType;
  workflow_id: string;
  workspace_id: string;
  run_id?: string;
  node_id?: string;
  node_type?: string;
  status?: string;
  error?: string;
  result?: Record<string, unknown>;
  contact_id?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

interface UseWorkflowEventsOptions {
  /** Workspace ID to subscribe to */
  workspaceId: string;
  /** Called when any workflow event is received */
  onEvent?: (event: WorkflowEvent) => void;
  /** Called when a workflow starts */
  onWorkflowStarted?: (event: WorkflowEvent) => void;
  /** Called when a workflow completes */
  onWorkflowCompleted?: (event: WorkflowEvent) => void;
  /** Called when a workflow fails */
  onWorkflowFailed?: (event: WorkflowEvent) => void;
  /** Called when a node starts executing */
  onNodeExecuting?: (event: WorkflowEvent) => void;
  /** Called when a node completes */
  onNodeCompleted?: (event: WorkflowEvent) => void;
  /** Called when a node fails */
  onNodeFailed?: (event: WorkflowEvent) => void;
  /** Whether to auto-invalidate workflow queries on events */
  autoInvalidate?: boolean;
  /** Whether to auto-connect (default: true) */
  enabled?: boolean;
}

interface UseWorkflowEventsReturn {
  /** Whether connected to WebSocket */
  isConnected: boolean;
  /** Recent events (last 50) */
  events: WorkflowEvent[];
  /** Clear events */
  clearEvents: () => void;
  /** Manually reconnect */
  reconnect: () => void;
}

/**
 * Hook for subscribing to real-time workflow events.
 *
 * @example
 * ```tsx
 * const { isConnected, events } = useWorkflowEvents({
 *   workspaceId: 'ws-123',
 *   onWorkflowCompleted: (event) => {
 *     toast.success(`Workflow ${event.workflow_id} completed!`);
 *   },
 *   autoInvalidate: true,
 * });
 * ```
 */
export function useWorkflowEvents(
  options: UseWorkflowEventsOptions
): UseWorkflowEventsReturn {
  const {
    workspaceId,
    onEvent,
    onWorkflowStarted,
    onWorkflowCompleted,
    onWorkflowFailed,
    onNodeExecuting,
    onNodeCompleted,
    onNodeFailed,
    autoInvalidate = true,
    enabled = true,
  } = options;

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);

  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const handleEvent = useCallback(
    (event: WorkflowEvent) => {
      // Add to events list (keep last 50)
      setEvents((prev) => [...prev.slice(-49), event]);

      // Call type-specific handlers
      onEvent?.(event);

      switch (event.event) {
        case 'workflow.started':
          onWorkflowStarted?.(event);
          break;
        case 'workflow.completed':
          onWorkflowCompleted?.(event);
          break;
        case 'workflow.failed':
          onWorkflowFailed?.(event);
          break;
        case 'node.executing':
          onNodeExecuting?.(event);
          break;
        case 'node.completed':
          onNodeCompleted?.(event);
          break;
        case 'node.failed':
          onNodeFailed?.(event);
          break;
      }

      // Auto-invalidate workflow queries
      if (autoInvalidate) {
        // Invalidate workflow runs for this workflow
        queryClient.invalidateQueries({
          queryKey: ['workflows', workspaceId, event.workflow_id, 'runs'],
        });

        // On completion/failure, invalidate the workflow list too
        if (
          event.event === 'workflow.completed' ||
          event.event === 'workflow.failed'
        ) {
          queryClient.invalidateQueries({
            queryKey: ['workflows', workspaceId],
          });
        }
      }
    },
    [
      onEvent,
      onWorkflowStarted,
      onWorkflowCompleted,
      onWorkflowFailed,
      onNodeExecuting,
      onNodeCompleted,
      onNodeFailed,
      autoInvalidate,
      queryClient,
      workspaceId,
    ]
  );

  const connect = useCallback(async () => {
    if (!WS_URL || !enabled || !user) return;

    try {
      // Get auth token
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        console.warn('No auth token available for WebSocket');
        return;
      }

      // Close existing connection
      ws.current?.close();

      // Connect with token
      const wsUrl = `${WS_URL}?token=${encodeURIComponent(token)}`;
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;

        // Subscribe to workspace events
        ws.current?.send(
          JSON.stringify({
            action: 'subscribe',
            data: {
              channel: 'workflow',
              resource_id: workspaceId,
            },
          })
        );
      };

      ws.current.onmessage = (messageEvent) => {
        try {
          const data = JSON.parse(messageEvent.data);

          if (data.action === 'workflow_event') {
            // Only process events for our workspace
            if (data.workspace_id === workspaceId) {
              handleEvent(data as WorkflowEvent);
            }
          } else if (data.action === 'pong') {
            // Heartbeat response, ignore
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.current.onclose = () => {
        setIsConnected(false);

        // Exponential backoff reconnect
        if (enabled && reconnectAttempts.current < 5) {
          const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
          reconnectAttempts.current++;

          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (e) {
      console.error('Failed to connect WebSocket:', e);
    }
  }, [WS_URL, enabled, user, workspaceId, handleEvent]);

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  // Connect on mount, reconnect on deps change
  useEffect(() => {
    connect();

    // Heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ action: 'ping' }));
      }
    }, 30000);

    return () => {
      clearInterval(heartbeatInterval);
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      ws.current?.close();
    };
  }, [connect]);

  return {
    isConnected,
    events,
    clearEvents,
    reconnect,
  };
}

/**
 * Hook for workflow event notifications with toast support.
 *
 * @example
 * ```tsx
 * // In your layout or workflow pages
 * useWorkflowNotifications({ workspaceId });
 * ```
 */
export function useWorkflowNotifications(options: {
  workspaceId: string;
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}) {
  const { workspaceId, showToast } = options;

  return useWorkflowEvents({
    workspaceId,
    onWorkflowStarted: (event) => {
      showToast?.(
        `Workflow started${event.metadata?.trigger_type ? ` (${event.metadata.trigger_type})` : ''}`,
        'info'
      );
    },
    onWorkflowCompleted: (_event) => {
      showToast?.(`Workflow completed successfully`, 'success');
    },
    onWorkflowFailed: (event) => {
      showToast?.(
        `Workflow failed${event.error ? `: ${event.error}` : ''}`,
        'error'
      );
    },
    autoInvalidate: true,
  });
}

export default useWorkflowEvents;

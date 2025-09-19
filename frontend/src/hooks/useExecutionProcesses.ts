import { useCallback } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { ExecutionProcess } from 'shared/types';

type ExecutionProcessState = {
  execution_processes: Record<string, ExecutionProcess>;
};

interface UseExecutionProcessesResult {
  executionProcesses: ExecutionProcess[];
  executionProcessesById: Record<string, ExecutionProcess>;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

/**
 * Stream execution processes for a task attempt via WebSocket (JSON Patch) and expose as array + map.
 * Server sends initial snapshot: replace /execution_processes with an object keyed by id.
 * Live updates arrive at /execution_processes/<id> via add/replace/remove operations.
 */
export const useExecutionProcesses = (
  taskAttemptId: string,
  opts?: { showSoftDeleted?: boolean }
): UseExecutionProcessesResult => {
  const showSoftDeleted = opts?.showSoftDeleted;
  const params = new URLSearchParams({ task_attempt_id: taskAttemptId });
  if (typeof showSoftDeleted === 'boolean') {
    params.set('show_soft_deleted', String(showSoftDeleted));
  }
  const endpoint = `/api/execution-processes/stream/ws?${params.toString()}`;

  const initialData = useCallback(
    (): ExecutionProcessState => ({ execution_processes: {} }),
    []
  );

  const { data, isConnected, error } =
    useJsonPatchWsStream<ExecutionProcessState>(
      endpoint,
      !!taskAttemptId,
      initialData
    );

  const executionProcessesById = data?.execution_processes ?? {};
  const executionProcesses = Object.values(executionProcessesById).sort(
    (a, b) =>
      new Date(a.created_at as unknown as string).getTime() -
      new Date(b.created_at as unknown as string).getTime()
  );
  const isLoading = !data && !error; // until first snapshot

  return {
    executionProcesses,
    executionProcessesById,
    isLoading,
    isConnected,
    error,
  };
};

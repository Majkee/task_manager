import { useState, useCallback, useEffect } from 'react';
import { useSupabaseQuery } from './useSupabaseQuery';
import {
  fetchColumns,
  fetchTasks,
  createColumn,
  updateColumn,
  deleteColumn,
  updateColumnPositions,
  createTask,
  updateTask,
  deleteTask,
  updateTaskPositions,
} from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { supabase } from '../lib/supabase';

type Column = Database['public']['Tables']['columns']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];

export function useBoard() {
  const [error, setError] = useState<string | null>(null);
  // Add local state for optimistic updates
  const [optimisticTasks, setOptimisticTasks] = useState<Task[] | null>(null);

  const { 
    data: columns,
    loading: columnsLoading,
    error: columnsError,
    refetch: refetchColumns,
    refreshCount: columnsRefreshCount
  } = useSupabaseQuery(fetchColumns, 'columns');

  const { 
    data: tasks,
    loading: tasksLoading,
    error: tasksError,
    refetch: refetchTasks,
    refreshCount: tasksRefreshCount
  } = useSupabaseQuery(fetchTasks, 'tasks');

  // Keep local state updated with server data
  useEffect(() => {
    if (tasks) {
      setOptimisticTasks(tasks);
    }
  }, [tasks]);

  // Subscribe to real-time changes but only on initial mount
  useEffect(() => {
    const columnsSubscription = supabase
      .channel('columns-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'columns'
        },
        () => {
          refetchColumns();
        }
      )
      .subscribe();

    const tasksSubscription = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        (payload) => {
          // Only do a full refresh for changes from other clients
          // Changes from this client will use optimistic updates
          const changeEvent = payload.eventType;
          if (changeEvent === 'INSERT' || changeEvent === 'UPDATE' || changeEvent === 'DELETE') {
            refetchTasks();
          }
        }
      )
      .subscribe();

    return () => {
      columnsSubscription.unsubscribe();
      tasksSubscription.unsubscribe();
    };
  }, [refetchColumns, refetchTasks]);

  const handleCreateColumn = useCallback(async (title: string) => {
    try {
      const position = columns ? Math.max(...columns.map(c => c.position), -1) + 1 : 0;
      await createColumn(title, position);
      await refetchColumns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create column');
      throw e;
    }
  }, [columns, refetchColumns]);

  const handleUpdateColumn = useCallback(async (id: string, title: string) => {
    try {
      await updateColumn(id, title);
      await refetchColumns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update column');
      throw e;
    }
  }, [refetchColumns]);

  const handleDeleteColumn = useCallback(async (id: string) => {
    try {
      await deleteColumn(id);
      await refetchColumns();
      await refetchTasks(); // Also refresh tasks as they might be affected
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete column');
      throw e;
    }
  }, [refetchColumns, refetchTasks]);

  const handleCreateTask = useCallback(async (
    title: string,
    columnId: string,
    priority: 'low' | 'medium' | 'high'
  ) => {
    if (!optimisticTasks) return;
    
    try {
      const columnTasks = optimisticTasks.filter(t => t.column_id === columnId) ?? [];
      const position = columnTasks.length > 0
        ? Math.max(...columnTasks.map(t => t.position)) + 1
        : 0;
      
      // Create temporary optimistic task
      const tempId = `temp-${Date.now()}`;
      const tempTask: Task = {
        id: tempId,
        title,
        column_id: columnId,
        priority,
        position,
        user_id: '', // Will be set by the server
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Update optimistic state
      setOptimisticTasks(prev => prev ? [...prev, tempTask] : [tempTask]);
      
      // Make the actual API call
      const createdTask = await createTask(title, columnId, priority, position);
      
      // Replace temp task with real one
      setOptimisticTasks(prev => 
        prev ? prev.map(t => t.id === tempId ? createdTask : t) : [createdTask]
      );
    } catch (e) {
      // On error, revert to server state
      await refetchTasks();
      setError(e instanceof Error ? e.message : 'Failed to create task');
      throw e;
    }
  }, [optimisticTasks, refetchTasks]);

  const handleUpdateTask = useCallback(async (
    id: string,
    updates: {
      title?: string;
      priority?: 'low' | 'medium' | 'high';
      column_id?: string;
      position?: number;
    }
  ) => {
    if (!optimisticTasks) return;
    
    try {
      // Optimistically update the task
      setOptimisticTasks(prev => 
        prev ? prev.map(task => 
          task.id === id ? { ...task, ...updates, updated_at: new Date().toISOString() } : task
        ) : null
      );
      
      // Make the actual API call
      await updateTask(id, updates);
    } catch (e) {
      // On error, revert to server state
      await refetchTasks();
      setError(e instanceof Error ? e.message : 'Failed to update task');
      throw e;
    }
  }, [optimisticTasks, refetchTasks]);

  const handleDeleteTask = useCallback(async (id: string) => {
    if (!optimisticTasks) return;
    
    try {
      // Optimistically remove the task
      setOptimisticTasks(prev => 
        prev ? prev.filter(task => task.id !== id) : null
      );
      
      // Make the actual API call
      await deleteTask(id);
    } catch (e) {
      // On error, revert to server state
      await refetchTasks();
      setError(e instanceof Error ? e.message : 'Failed to delete task');
      throw e;
    }
  }, [optimisticTasks, refetchTasks]);

  const handleMoveTask = useCallback(async (
    taskId: string,
    newColumnId: string,
    newPosition: number
  ) => {
    if (!optimisticTasks) return;
    
    try {
      // Get the current task
      const taskToMove = optimisticTasks.find(t => t.id === taskId);
      if (!taskToMove) return;
      
      // Get tasks in the target column (excluding the task being moved)
      const columnTasks = optimisticTasks
        .filter(t => t.column_id === newColumnId && t.id !== taskId);
      
      // Create updates
      const updates = columnTasks
        .map(task => ({
          id: task.id,
          position: task.position >= newPosition ? task.position + 1 : task.position,
          column_id: newColumnId,
        }));
      
      // Add the moved task update
      updates.push({
        id: taskId,
        position: newPosition,
        column_id: newColumnId,
      });
      
      // Apply optimistic updates
      setOptimisticTasks(prev => {
        if (!prev) return null;
        
        // Create a new array with updated positions
        return prev.map(task => {
          const update = updates.find(u => u.id === task.id);
          if (update) {
            return {
              ...task,
              position: update.position,
              column_id: update.column_id,
              updated_at: new Date().toISOString()
            };
          }
          return task;
        });
      });
      
      // Make the actual API call
      await updateTaskPositions(updates);
    } catch (e) {
      // On error, revert to server state
      await refetchTasks();
      setError(e instanceof Error ? e.message : 'Failed to move task');
      throw e;
    }
  }, [optimisticTasks, refetchTasks]);

  const handleReorderTasks = useCallback(async (updates: { id: string; position: number; column_id: string }[]) => {
    if (!optimisticTasks) return;
    
    try {
      // Apply optimistic updates
      setOptimisticTasks(prev => {
        if (!prev) return null;
        
        // Create a new array with updated positions
        return prev.map(task => {
          const update = updates.find(u => u.id === task.id);
          if (update) {
            return {
              ...task,
              position: update.position,
              column_id: update.column_id,
              updated_at: new Date().toISOString()
            };
          }
          return task;
        });
      });
      
      // Make the actual API call
      await updateTaskPositions(updates);
    } catch (e) {
      // On error, revert to server state
      await refetchTasks();
      setError(e instanceof Error ? e.message : 'Failed to reorder tasks');
      throw e;
    }
  }, [optimisticTasks, refetchTasks]);

  return {
    columns,
    tasks: optimisticTasks || tasks, // Use optimistic tasks if available
    loading: columnsLoading || tasksLoading,
    error: error || columnsError || tasksError,
    columnsRefreshCount,
    tasksRefreshCount,
    createColumn: handleCreateColumn,
    updateColumn: handleUpdateColumn,
    deleteColumn: handleDeleteColumn,
    createTask: handleCreateTask,
    updateTask: handleUpdateTask,
    deleteTask: handleDeleteTask,
    moveTask: handleMoveTask,
    reorderTasks: handleReorderTasks,
  };
}
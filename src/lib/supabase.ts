import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export async function fetchColumns() {
  const { data: columns, error } = await supabase
    .from('columns')
    .select('*')
    .order('position');
  
  if (error) throw error;
  return columns;
}

export async function createColumn(title: string, position: number) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  const { data: column, error } = await supabase
    .from('columns')
    .insert({
      title,
      position,
      user_id: user.user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return column;
}

export async function updateColumn(id: string, title: string) {
  const { data: column, error } = await supabase
    .from('columns')
    .update({ title })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return column;
}

export async function deleteColumn(id: string) {
  const { error } = await supabase
    .from('columns')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function updateColumnPositions(updates: { id: string; position: number }[]) {
  const { error } = await supabase
    .from('columns')
    .upsert(
      updates.map(({ id, position }) => ({
        id,
        position,
      }))
    );

  if (error) throw error;
}

export async function fetchTasks() {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .order('position');
  
  if (error) throw error;
  return tasks;
}

export async function createTask(
  title: string,
  columnId: string,
  priority: 'low' | 'medium' | 'high',
  position: number
) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      title,
      column_id: columnId,
      priority,
      position,
      user_id: user.user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return task;
}

export async function updateTask(
  id: string,
  updates: {
    title?: string;
    priority?: 'low' | 'medium' | 'high';
    column_id?: string;
    position?: number;
  }
) {
  const { data: task, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return task;
}

export async function deleteTask(id: string) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function updateTaskPositions(updates: { id: string; position: number; column_id: string }[]) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  // First, fetch the current tasks to get their titles and priorities
  const { data: currentTasks, error: fetchError } = await supabase
    .from('tasks')
    .select('id, title, priority')
    .in('id', updates.map(u => u.id));

  if (fetchError) throw fetchError;

  // Create maps of task IDs to their titles and priorities
  const taskTitles = new Map(currentTasks?.map(task => [task.id, task.title]) ?? []);
  const taskPriorities = new Map(currentTasks?.map(task => [task.id, task.priority]) ?? []);

  const { error } = await supabase
    .from('tasks')
    .upsert(
      updates.map(({ id, position, column_id }) => ({
        id,
        position,
        column_id,
        user_id: user.user.id,
        title: taskTitles.get(id), // Include the existing title
        priority: taskPriorities.get(id) // Include the existing priority
      }))
    );

  if (error) throw error;
}
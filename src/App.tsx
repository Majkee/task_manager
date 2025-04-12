import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Plus, MoreVertical, Circle, Clock, AlertCircle, X, Edit2, Trash2, LogOut } from 'lucide-react';
import { Login } from './pages/Login';
import { SignUp } from './pages/SignUp';
import { AuthLayout } from './components/AuthLayout';
import { useBoard } from './hooks/useBoard';
import { supabase } from './lib/supabase';
import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
  useDroppable,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Database } from './lib/database.types';

type Column = Database['public']['Tables']['columns']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type Priority = 'low' | 'medium' | 'high';

interface TaskFormData {
  title: string;
  priority: Priority;
}

interface DeleteConfirmationProps {
  isOpen: boolean;
  columnTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmation({ isOpen, columnTitle, onConfirm, onCancel }: DeleteConfirmationProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Column</h3>
        <p className="text-gray-600 mb-6">
          Are you sure you want to delete "{columnTitle}"? All tasks in this column will be moved to the first available column.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

const priorityOptions: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

interface TaskCardProps {
  task: Task;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => void;
  isDragging?: boolean;
}

function TaskCard({ task, onEdit, onDelete, isDragging }: TaskCardProps) {
  const getPriorityIcon = (priority: Priority) => {
    switch (priority) {
      case 'high':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'medium':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'low':
        return <Circle className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <div 
      className={`
        bg-white rounded-lg shadow-sm p-3 mb-2 
        ${isDragging ? 'opacity-50' : 'hover:shadow-md'} 
        transition-all duration-200
        cursor-grab active:cursor-grabbing
      `}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm text-gray-800 flex-1">{task.title}</span>
        {!isDragging && onEdit && onDelete && (
          <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={() => onEdit(task)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <MoreVertical className="w-4 h-4 text-gray-400" />
            </button>
            <button
              onClick={() => onDelete(task.id)}
              className="p-1 hover:bg-red-100 rounded"
            >
              <X className="w-4 h-4 text-red-400" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {getPriorityIcon(task.priority)}
        <span className="text-xs text-gray-500 capitalize">{task.priority} priority</span>
      </div>
    </div>
  );
}

interface SortableTaskProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  isEditing: boolean;
}

function SortableTask({ task, onEdit, onDelete, isEditing }: SortableTaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isEditing) {
    return null;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="touch-none"
    >
      <TaskCard
        task={task}
        onEdit={onEdit}
        onDelete={onDelete}
        isDragging={isDragging}
      />
    </div>
  );
}

interface DroppableColumnProps {
  column: Column;
  onEditColumn: (column: Column) => void;
  onDeleteColumn: (id: string) => void;
  children: React.ReactNode;
}

function DroppableColumn({ column, onEditColumn, onDeleteColumn, children }: DroppableColumnProps) {
  const { setNodeRef } = useDroppable({ id: column.id });
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <>
      <div 
        ref={setNodeRef}
        className="bg-[#ebecf0] rounded-lg p-3 min-h-[calc(100vh-12rem)] w-[272px] flex-shrink-0"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex items-center justify-between mb-2 group">
          <h2 className="text-[#172b4d] font-semibold text-sm px-2 flex-1">
            {column.title}
          </h2>
          <div className={`flex space-x-1 ${isHovered ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}>
            <button
              onClick={() => onEditColumn(column)}
              className="p-1 hover:bg-[#dfe1e6] rounded"
              title="Edit column"
            >
              <Edit2 className="w-4 h-4 text-gray-500" />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1 hover:bg-red-100 rounded"
              title="Delete column"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
          </div>
        </div>
        {children}
      </div>
      <DeleteConfirmation
        isOpen={showDeleteConfirm}
        columnTitle={column.title}
        onConfirm={() => {
          onDeleteColumn(column.id);
          setShowDeleteConfirm(false);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}

function Dashboard() {
  const {
    columns,
    tasks,
    loading,
    error,
    columnsRefreshCount,
    tasksRefreshCount,
    createColumn,
    updateColumn,
    deleteColumn,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    reorderTasks,
    refetchTasks,
  } = useBoard();

  React.useEffect(() => {
    console.log("Data refreshed - columns:", columnsRefreshCount, "tasks:", tasksRefreshCount);
  }, [columnsRefreshCount, tasksRefreshCount]);

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isAddingTask, setIsAddingTask] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newTaskData, setNewTaskData] = useState<TaskFormData>({
    title: '',
    priority: 'medium',
  });

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 100,
        tolerance: 5,
      },
    })
  );

  const getTasksByColumn = useCallback((columnId: string) => {
    // Ensure we're using the most up-to-date tasks data
    return tasks?.filter(task => task.column_id === columnId).sort((a, b) => a.position - b.position) ?? [];
  }, [tasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeTask = tasks?.find(task => task.id === active.id);
    if (activeTask) {
      setActiveTask(activeTask);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !tasks) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const activeTask = tasks.find(task => task.id === activeId);
    const overTask = tasks.find(task => task.id === overId);

    if (!activeTask) return;

    // We'll handle the actual task movement in dragEnd
    // This just handles visual positioning during the drag
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || !tasks) {
      setActiveTask(null);
      return;
    }

    const activeId = active.id;
    const overId = over.id;

    const activeTask = tasks.find(task => task.id === activeId);
    
    if (!activeTask) {
      setActiveTask(null);
      return;
    }

    try {
      if (typeof overId === 'string') {
        const isColumn = !tasks.some(task => task.id === overId);
        
        if (isColumn) {
          // Dropping onto a column
          const columnId = overId;
          const columnTasks = tasks.filter(t => t.column_id === columnId);
          const newPosition = columnTasks.length;
          
          // Only update if the task is actually moving to a different column
          if (activeTask.column_id !== columnId) {
            await moveTask(activeTask.id, columnId, newPosition);
          }
        } else {
          // Dropping onto another task
          const overTask = tasks.find(task => task.id === overId);
          if (!overTask) {
            setActiveTask(null);
            return;
          }
          
          const columnTasks = tasks.filter(t => t.column_id === overTask.column_id);
          const sortedTasks = [...columnTasks].sort((a, b) => a.position - b.position);
          const overIndex = sortedTasks.findIndex(t => t.id === overTask.id);
          
          if (overIndex === -1) {
            setActiveTask(null);
            return;
          }

          // Create updates for all tasks in the column
          const updates = sortedTasks.map((task, index) => ({
            id: task.id,
            position: index,
            column_id: overTask.column_id
          }));

          // If moving to a different column, update the column_id for the moved task
          if (activeTask.column_id !== overTask.column_id) {
            const movedTaskUpdate = updates.find(u => u.id === activeTask.id);
            if (movedTaskUpdate) {
              movedTaskUpdate.column_id = overTask.column_id;
            }
          }

          // Apply the update
          await reorderTasks(updates);
        }
      }
    } catch (error) {
      console.error('Error updating task position:', error);
      // Revert to server state on error
      if (typeof refetchTasks === 'function') {
        await refetchTasks();
      }
    } finally {
      setActiveTask(null);
    }
  };

  const handleAddColumn = async () => {
    try {
      await createColumn('New Column');
      // Don't set editing state here - let the real-time update handle it
    } catch (error) {
      console.error('Failed to create column:', error);
    }
  };

  const handleEditColumn = (column: Column) => {
    setEditingColumn(column);
    setNewColumnTitle(column.title);
  };

  const handleUpdateColumn = async () => {
    if (!editingColumn || !newColumnTitle.trim()) return;

    try {
      await updateColumn(editingColumn.id, newColumnTitle.trim());
      setEditingColumn(null);
    } catch (error) {
      console.error('Failed to update column:', error);
    }
  };

  const handleDeleteColumn = async (columnId: string) => {
    try {
      await deleteColumn(columnId);
    } catch (error) {
      console.error('Failed to delete column:', error);
    }
  };

  const handleAddTask = (columnId: string) => {
    setIsAddingTask(columnId);
    setNewTaskData({ title: '', priority: 'medium' });
  };

  const handleSaveNewTask = async () => {
    if (!isAddingTask || !newTaskData.title.trim()) return;

    try {
      await createTask(
        newTaskData.title.trim(),
        isAddingTask,
        newTaskData.priority
      );
      setIsAddingTask(null);
      setNewTaskData({ title: '', priority: 'medium' });
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setNewTaskData({
      title: task.title,
      priority: task.priority,
    });
  };

  const handleUpdateTask = async () => {
    if (!editingTask || !newTaskData.title.trim()) return;

    try {
      await updateTask(editingTask.id, {
        title: newTaskData.title.trim(),
        priority: newTaskData.priority,
      });
      setEditingTask(null);
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTask(taskId);
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const TaskForm = ({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) => (
    <div className="bg-white rounded-lg shadow-sm p-3 mb-2">
      <input
        type="text"
        value={newTaskData.title}
        onChange={(e) => setNewTaskData({ ...newTaskData, title: e.target.value })}
        placeholder="Enter task title"
        className="w-full mb-2 px-2 py-1.5 border border-blue-300 rounded text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        autoFocus
      />
      <select
        value={newTaskData.priority}
        onChange={(e) => setNewTaskData({ ...newTaskData, priority: e.target.value as Priority })}
        className="w-full mb-2 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      >
        {priorityOptions.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="flex justify-end space-x-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded"
        >
          Save
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="bg-[#026aa7] px-4 py-2">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">Task Board</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddColumn}
              className="px-3 py-1.5 text-sm text-white bg-[#ffffff33] hover:bg-[#ffffff44] rounded transition-colors duration-200"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                supabase.auth.signOut();
              }}
              className="px-3 py-1.5 text-sm text-white bg-[#ffffff33] hover:bg-[#ffffff44] rounded transition-colors duration-200"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-[1400px] mx-auto">
        <DndContext 
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {columns?.map(column => (
              <DroppableColumn
                key={column.id}
                column={column}
                onEditColumn={handleEditColumn}
                onDeleteColumn={handleDeleteColumn}
              >
                {editingColumn?.id === column.id ? (
                  <div className="mb-4">
                    <input
                      type="text"
                      value={newColumnTitle}
                      onChange={(e) => setNewColumnTitle(e.target.value)}
                      className="w-full px-2 py-1.5 border border-blue-300 rounded text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdateColumn();
                        if (e.key === 'Escape') setEditingColumn(null);
                      }}
                    />
                    <div className="flex justify-end space-x-2 mt-2">
                      <button
                        onClick={() => setEditingColumn(null)}
                        className="px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleUpdateColumn}
                        className="px-2 py-1 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-2">
                      <span className="text-gray-500 text-sm">
                        ({getTasksByColumn(column.id).length})
                      </span>
                    </div>

                    {isAddingTask === column.id && (
                      <TaskForm
                        onSave={handleSaveNewTask}
                        onCancel={() => setIsAddingTask(null)}
                      />
                    )}
                    
                    <SortableContext
                      items={getTasksByColumn(column.id).map(task => task.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {getTasksByColumn(column.id).map(task => (
                        <React.Fragment key={task.id}>
                          {editingTask?.id === task.id ? (
                            <TaskForm
                              onSave={handleUpdateTask}
                              onCancel={() => setEditingTask(null)}
                            />
                          ) : (
                            <SortableTask
                              task={task}
                              onEdit={handleEditTask}
                              onDelete={handleDeleteTask}
                              isEditing={editingTask?.id === task.id}
                            />
                          )}
                        </React.Fragment>
                      ))}
                    </SortableContext>

                    {!isAddingTask && (
                      <button
                        onClick={() => handleAddTask(column.id)}
                        className="w-full mt-2 flex items-center gap-1 px-2 py-1.5 text-[#172b4d] hover:bg-[#dfe1e6] rounded-md transition-colors duration-200 text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add a card</span>
                      </button>
                    )}
                  </>
                )}
              </DroppableColumn>
            ))}
          </div>

          <DragOverlay dropAnimation={{
            duration: 200,
            easing: 'ease',
            sideEffects: defaultDropAnimationSideEffects({
              styles: {
                active: {
                  opacity: '0.5',
                },
              },
            }),
          }}>
            {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
}

// Create a new wrapper component for real-time subscriptions
function RealTimeUpdatesProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Set up a subscription channel for both tables
    const channel = supabase.channel('db-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
      }, (payload) => {
        // We don't need to do anything here as each component will 
        // handle its own updates through the useBoard hook
        console.log('Real-time update received:', payload);
      })
      .subscribe((status) => {
        console.log('Supabase subscription status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    // Clean up
    return () => {
      channel.unsubscribe();
    };
  }, []);

  return (
    <>
      {!isConnected && (
        <div className="fixed bottom-4 right-4 bg-yellow-100 text-yellow-800 px-4 py-2 rounded-lg shadow-md text-sm">
          Connecting to real-time updates...
        </div>
      )}
      {children}
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route
          path="/"
          element={
            <AuthLayout>
              <RealTimeUpdatesProvider>
                <Dashboard />
              </RealTimeUpdatesProvider>
            </AuthLayout>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
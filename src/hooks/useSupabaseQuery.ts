import { useEffect, useState, useRef, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useSupabaseQuery<T extends { id: string }>(
  query: () => Promise<T[]>,
  table: string,
  deps: any[] = []
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isMountedRef = useRef(true);
  const queryRef = useRef(query);
  const refreshCountRef = useRef(0);

  // Update the query ref when the query function changes
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!isMountedRef.current) return;
    
    try {
      setLoading(true);
      const result = await queryRef.current();
      
      if (isMountedRef.current) {
        // Only update state if data actually changed or if forceRefresh is true
        if (forceRefresh || JSON.stringify(result) !== JSON.stringify(data)) {
          setData(result);
          refreshCountRef.current += 1; // Increment refresh counter to trigger re-renders
        }
        setError(null);
      }
    } catch (e) {
      if (isMountedRef.current) {
        setError(e instanceof Error ? e : new Error('An error occurred'));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [data]);

  useEffect(() => {
    let isSubscribed = true;

    // Clean up existing subscription
    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    // Create a new channel with a unique ID to avoid conflicts
    const channelId = `${table}_changes_${Math.random().toString(36).substring(2, 15)}`;
    const channel = supabase.channel(channelId);

    // Set up subscription for all changes
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
        },
        (payload) => {
          if (isMountedRef.current) {
            // Instead of trying to update the data directly, fetch all data again
            // This ensures we have the latest state from the server
            fetchData(true);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && isMountedRef.current && isSubscribed) {
          fetchData(true);
        }
      });

    // Store the channel reference
    channelRef.current = channel;

    // Initial data fetch
    fetchData(true);

    // Cleanup function
    return () => {
      isSubscribed = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [...deps, table]);

  return { 
    data, 
    loading, 
    error, 
    refetch: useCallback(() => fetchData(true), [fetchData]),
    refreshCount: refreshCountRef.current // Expose refresh count to force re-renders
  };
}
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

interface UseSSEReturn {
  lastEvent: SSEEvent | null;
  eventHistory: SSEEvent[];
  isConnected: boolean;
  eventCount: number; // total events received in this session
  reconnect: () => void;
}

const MAX_HISTORY = 100;

export function useSSE(url = "/api/events"): UseSSEReturn {
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [eventHistory, setEventHistory] = useState<SSEEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventCountRef = useRef(0);

  const connect = useCallback(() => {
    // Close existing connection
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    try {
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
      };

      es.onerror = () => {
        setIsConnected(false);
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }
        // Auto-reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, Math.min(eventCountRef.current, 5)), 30000);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      // Listen for all known event types
      const eventTypes = ["agent-update", "email-progress", "new-lead", "email-sent", "research-complete", "operator-command"];
      for (const type of eventTypes) {
        es.addEventListener(type, (e: MessageEvent) => {
          let data: unknown;
          try {
            data = JSON.parse(e.data);
          } catch {
            data = e.data;
          }
          const evt: SSEEvent = {
            type,
            data,
            timestamp: new Date().toISOString(),
          };
          setLastEvent(evt);
          setEventHistory((prev) => {
            const next = [evt, ...prev];
            if (next.length > MAX_HISTORY) next.length = MAX_HISTORY;
            return next;
          });
          eventCountRef.current += 1;
          setEventCount(eventCountRef.current);
        });
      }
    } catch {
      setIsConnected(false);
      const delay = Math.min(1000 * Math.pow(2, Math.min(eventCountRef.current, 5)), 30000);
      reconnectTimerRef.current = setTimeout(connect, delay);
    }
  }, [url]);

  const reconnect = useCallback(() => {
    eventCountRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connect]);

  return { lastEvent, eventHistory, isConnected, eventCount, reconnect };
}

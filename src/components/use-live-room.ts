"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@/components/room-types";
import { connectLive, type LiveUpdate } from "@/lib/live";

/** Connection state surfaced by the LiveIndicator. */
export type LiveStatus = "off" | "connecting" | "connected" | "reconnecting";

export interface LiveRoomCallbacks {
  /** Fired on every (re)connect — do a catch-up pull here. */
  onOpen: () => void;
  /** Another terminal pushed; payload is ciphertext to decrypt locally. */
  onUpdate: (update: LiveUpdate) => void;
  /** This member was revoked by the creator (terminal). */
  onRevoked: () => void;
  /** The room was removed or expired (terminal). */
  onRoomGone: () => void;
  /** Gave up reconnecting — HTTP Push/Pull still work. */
  onFailed: () => void;
}

/**
 * Keep a live WebSocket open while `session` is in a live sync mode; close it
 * on leave/unmount. Callbacks are kept in a ref so consumers can pass fresh
 * closures every render without churning the connection.
 */
export function useLiveRoom(
  session: Session | null,
  callbacks: LiveRoomCallbacks,
): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>("off");
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const live = session !== null && session.syncMode !== "manual";
  const roomId = session?.roomId;
  const token = session?.token;

  useEffect(() => {
    if (!live || roomId === undefined || token === undefined) {
      setStatus("off");
      return;
    }
    setStatus("connecting");
    const connection = connectLive({
      roomId,
      token,
      onEvent: (event) => {
        switch (event.type) {
          case "open":
            setStatus("connected");
            callbacksRef.current.onOpen();
            break;
          case "update":
            callbacksRef.current.onUpdate(event.update);
            break;
          case "reconnecting":
            setStatus("reconnecting");
            break;
          case "closed":
            setStatus("off");
            if (event.reason === "revoked") callbacksRef.current.onRevoked();
            else if (event.reason === "room-gone") {
              callbacksRef.current.onRoomGone();
            } else callbacksRef.current.onFailed();
            break;
        }
      },
    });
    return () => {
      connection.close();
      setStatus("off");
    };
  }, [live, roomId, token]);

  return status;
}

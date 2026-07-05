"use client";

import { RefreshCw, Trash2, UserMinus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Hint } from "@/components/hint";
import type { Session, Status } from "@/components/room-types";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  listMembers,
  type MemberRow,
  removeMember,
} from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

/**
 * Creator-only controls, shown below the shared editor and the (shared) Share
 * controls. Everything here is a convenience on top of the server-side creator
 * checks: a joiner who forged this UI still gets 403/401 from the Worker.
 *
 * - An on-demand table of who is in the room (role + join time), refreshed on
 *   mount and via the Refresh button, with a Remove button per joiner. Removing
 *   revokes that token; the sealed slot does NOT reopen.
 * - Nuke the whole room (blob + members). Link/password sharing lives in
 *   `ShareControls`, which every member sees.
 */
export function CreatorPanel({
  session,
  onStatus,
  onSessionInvalid,
  onRemoveRoom,
}: {
  session: Session;
  onStatus: (status: Status) => void;
  onSessionInvalid: () => void;
  onRemoveRoom: () => void;
}) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMembers(session.roomId, session.token);
      if (!res.ok) {
        if (res.error === ApiError.SLOT_LOST) onSessionInvalid();
        onStatus({ kind: "error", message: res.error });
        return;
      }
      setMembers(res.value);
      // Keep the creator's status line in sync with the live roster: a fresh
      // count of joined terminals, sealed once the cap is reached. A public room
      // (capacity 0) never seals and has no target to wait for.
      const count = res.value.length;
      if (session.capacity === 0) {
        onStatus({
          kind: "info",
          message: `Public room — ${count} terminal${count === 1 ? "" : "s"} connected; anyone with the password can join.`,
        });
      } else {
        const waiting = session.capacity - count;
        onStatus(
          waiting <= 0
            ? {
                kind: "validated",
                message: `Private room sealed (${count}/${session.capacity}) — sharing is locked to these terminals.`,
              }
            : {
                kind: "info",
                message: `Created as terminal ${session.slot} of ${session.capacity} — waiting for ${waiting} more.`,
              },
        );
      }
    } finally {
      setLoading(false);
    }
  }, [
    session.roomId,
    session.token,
    session.slot,
    session.capacity,
    onStatus,
    onSessionInvalid,
  ]);

  // Load the roster once on mount.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRemove = useCallback(
    async (member: MemberRow) => {
      const res = await removeMember(session.roomId, session.token, member.id);
      if (!res.ok) {
        if (res.error === ApiError.SLOT_LOST) onSessionInvalid();
        onStatus({ kind: "error", message: res.error });
        return;
      }
      onStatus({
        kind: "validated",
        message: `Removed terminal #${member.id} — its slot stays sealed.`,
      });
      void refresh();
    },
    [session.roomId, session.token, onStatus, onSessionInvalid, refresh],
  );

  const handleRemoveRoom = useCallback(() => {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        "Remove this room for everyone? This deletes the content, all members, and cannot be undone.",
      );
    if (confirmed) onRemoveRoom();
  }, [onRemoveRoom]);

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium">Room controls</h2>
        <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
          creator
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Hint text="Delete the room, its members, and its content for everyone. Cannot be undone.">
            <Button size="sm" variant="destructive" onClick={handleRemoveRoom}>
              <Trash2 /> Remove room
            </Button>
          </Hint>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            Terminals ({members.length}/
            {session.capacity === 0 ? "∞" : session.capacity})
            {session.capacity === 0
              ? " · public"
              : session.sealed
                ? " · private, sealed"
                : " · private"}
          </h3>
          <Hint text="Refresh the list of connected terminals.">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void refresh()}
              disabled={loading}
              aria-label="Refresh members"
            >
              <RefreshCw /> {loading ? "…" : "Refresh"}
            </Button>
          </Hint>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Connected</th>
                <th className="px-3 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-3 text-center text-xs text-muted-foreground"
                  >
                    {loading ? "Loading…" : "No terminals yet."}
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-3 py-2 tabular-nums">{m.id}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          m.role === "creator"
                            ? "font-medium"
                            : "text-muted-foreground"
                        }
                      >
                        {m.role}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {formatDateTime(m.joinedAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {m.role === "joiner" ? (
                        <Hint text="Revoke this joiner's token. Their slot stays sealed and does not reopen.">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleRemove(m)}
                          >
                            <UserMinus /> Remove
                          </Button>
                        </Hint>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

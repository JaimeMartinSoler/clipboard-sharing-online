/**
 * Format an epoch-ms timestamp as `YYYY-MM-DD HH:mm:SS` in the viewer's local
 * time (issue #7 members table). Pure and DOM-free so it is unit-testable.
 */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

import { jsonError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Renders a previously dispatched email's HTML (owner only). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, res } = await requireUser();
  if (res) return res;
  const { id } = await ctx.params;
  const log = await db.alertLog.findFirst({ where: { id, userId: user.id }, select: { emailHtml: true } });
  if (!log) return jsonError(404, "Not found");

  return new Response(log.emailHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      // Stored HTML is escaped at render time; CSP additionally blocks any script execution.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; frame-ancestors 'self'",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}

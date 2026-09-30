import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { ensureDbReady, getSql } from "@/lib/db";
import { usernameToEmail } from "@/lib/mores-constants";

function quiet(error: string, status = 200) {
  return Response.json({ ok: false, error }, { status });
}

export const Route = createFileRoute("/api/club-sign-in")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await ensureDbReady();
          const body = (await request.json().catch(() => ({}))) as {
            username?: string;
            email?: string;
            password?: string;
          };
          const username = String(body.username ?? "").trim();
          const typed = String(body.email ?? "").trim().toLowerCase();
          const password = String(body.password ?? "");
          if (password.length < 8) return quiet("Password must be at least 8 characters.");

          const sql = await getSql();
          let email = "";
          if (username && !username.includes("@")) {
            const rows = await sql<{ email: string }>`
              select u.email
              from "user" u
              join profiles p on p.user_id = u.id
              where p.username_lc = ${username.toLowerCase()}
              limit 1
            `;
            email = String(rows[0]?.email ?? "").toLowerCase();
          }
          if (!email && typed.includes("@")) email = typed;
          if (!email && username.includes("@")) email = username.toLowerCase();
          if (!email && username) email = usernameToEmail(username);
          if (!email) return quiet("Enter your username or the email you created with.");

          const signed = await auth.api.signInEmail({
            body: { email, password },
            headers: request.headers,
            asResponse: true,
          });
          if (!signed.ok) {
            return quiet("No seat with that name and password. Use the email you created the account with.");
          }
          const headers = new Headers({ "content-type": "application/json" });
          const cookies =
            typeof signed.headers.getSetCookie === "function" ? signed.headers.getSetCookie() : [];
          for (const cookie of cookies) headers.append("set-cookie", cookie);
          if (!cookies.length) {
            const single = signed.headers.get("set-cookie");
            if (single) headers.append("set-cookie", single);
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
        } catch (err) {
          console.error("[club-sign-in]", err);
          return quiet("Sign-in did not go through. Try once more.");
        }
      },
    },
  },
});

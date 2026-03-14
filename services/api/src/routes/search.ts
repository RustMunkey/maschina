import { search } from "@maschina/search";
import type { IndexName } from "@maschina/search";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

app.use("*", requireAuth);

const ALLOWED_TYPES: IndexName[] = ["agents"];

// GET /search?q=...&type=agents&limit=20&offset=0
app.get("/", async (c) => {
  const { id: userId } = c.get("user");
  const q = c.req.query("q") ?? "";
  const type = (c.req.query("type") ?? "agents") as IndexName;
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = Number(c.req.query("offset") ?? 0);

  if (!ALLOWED_TYPES.includes(type)) {
    throw new HTTPException(400, {
      message: `Invalid type. Allowed: ${ALLOWED_TYPES.join(", ")}`,
    });
  }

  const results = await search(type, q, {
    limit,
    offset,
    filter: `userId = "${userId}"`,
    sort: ["createdAt:desc"],
  });

  return c.json(results);
});

export default app;

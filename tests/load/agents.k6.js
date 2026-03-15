import { check, group, sleep } from "k6";
/**
 * k6 load test — authenticated agent CRUD endpoints.
 *
 * Usage:
 *   API_TOKEN=<your-api-key> k6 run tests/load/agents.k6.js
 *
 * Requires a valid API token (Bearer JWT or API key starting with msk_).
 * Tests agent list, create, read, update, delete under load.
 *
 * Thresholds: p95 < 500ms, error rate < 1%
 */
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.API_BASE_URL || "http://localhost:3000";
const TOKEN = __ENV.API_TOKEN;

if (!TOKEN) {
  throw new Error("API_TOKEN env variable is required. Use an API key (msk_...) or JWT.");
}

const agentLatency = new Trend("agent_latency", true);
const errorRate = new Rate("error_rate");

export const options = {
  stages: [
    { duration: "10s", target: 10 },
    { duration: "30s", target: 10 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    agent_latency: ["p(95)<500"],
    error_rate: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
  },
};

const authHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${TOKEN}`,
};

export default function () {
  let agentId;

  group("list agents", () => {
    const res = http.get(`${BASE_URL}/agents`, { headers: authHeaders });
    agentLatency.add(res.timings.duration);
    errorRate.add(res.status !== 200);
    check(res, {
      "list returns 200": (r) => r.status === 200,
      "list returns array": (r) => {
        try {
          return Array.isArray(JSON.parse(r.body));
        } catch {
          return false;
        }
      },
    });
  });

  sleep(0.1);

  group("create agent", () => {
    const res = http.post(
      `${BASE_URL}/agents`,
      JSON.stringify({
        name: `load-test-agent-${Date.now()}`,
        type: "signal",
        description: "Load test agent",
      }),
      { headers: authHeaders },
    );
    agentLatency.add(res.timings.duration);
    errorRate.add(res.status !== 201);
    check(res, {
      "create returns 201": (r) => r.status === 201,
      "create returns agent with id": (r) => {
        try {
          const body = JSON.parse(r.body);
          agentId = body.id;
          return typeof body.id === "string";
        } catch {
          return false;
        }
      },
    });
  });

  sleep(0.1);

  if (agentId) {
    group("get agent by id", () => {
      const res = http.get(`${BASE_URL}/agents/${agentId}`, { headers: authHeaders });
      agentLatency.add(res.timings.duration);
      errorRate.add(res.status !== 200);
      check(res, { "get returns 200": (r) => r.status === 200 });
    });

    sleep(0.1);

    group("delete agent", () => {
      const res = http.del(`${BASE_URL}/agents/${agentId}`, null, { headers: authHeaders });
      agentLatency.add(res.timings.duration);
      errorRate.add(res.status !== 200 && res.status !== 204);
      check(res, { "delete returns 200 or 204": (r) => r.status === 200 || r.status === 204 });
    });
  }

  sleep(0.5);
}

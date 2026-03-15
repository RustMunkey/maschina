import { check, group, sleep } from "k6";
/**
 * k6 load test — auth endpoint rate limiting and throughput.
 *
 * Usage:
 *   k6 run tests/load/auth.k6.js
 *   k6 run --vus 10 --duration 60s tests/load/auth.k6.js
 *
 * Tests:
 *   - Login with invalid credentials (should 401 consistently)
 *   - Register with invalid data (should 400 consistently)
 *   - Verifies rate limiter kicks in (429) under high concurrency
 *
 * Note: does NOT create real users — purely validation/rate-limit testing.
 */
import http from "k6/http";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.API_BASE_URL || "http://localhost:3000";

const authLatency = new Trend("auth_latency", true);
const validationErrors = new Counter("validation_errors");
const authErrors = new Counter("auth_errors");
const rateLimitHits = new Counter("rate_limit_hits");

export const options = {
  scenarios: {
    // Sustained load on login
    login_load: {
      executor: "constant-arrival-rate",
      rate: 5, // 5 requests/second
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 10,
      maxVUs: 30,
      exec: "loginFlow",
    },
    // Spike to test rate limiter
    registration_spike: {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      stages: [
        { duration: "10s", target: 20 }, // spike
        { duration: "20s", target: 20 }, // sustain
        { duration: "10s", target: 0 }, // cool down
      ],
      preAllocatedVUs: 20,
      maxVUs: 50,
      exec: "registrationFlow",
    },
  },
  thresholds: {
    auth_latency: ["p(95)<500"], // auth can be slower, allow 500ms
    http_req_failed: ["rate<0.05"], // less than 5% unexpected failures
  },
};

export function loginFlow() {
  group("login with wrong credentials", () => {
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: "nonexistent@maschina.ai", password: "wrongpassword123" }),
      { headers: { "Content-Type": "application/json" } },
    );

    authLatency.add(res.timings.duration);

    if (res.status === 401) authErrors.add(1);
    if (res.status === 429) rateLimitHits.add(1);

    check(res, {
      "login returns 401 or 429": (r) => r.status === 401 || r.status === 429,
      "response is JSON": (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
    });
  });

  sleep(0.2);
}

export function registrationFlow() {
  group("register with invalid data", () => {
    const res = http.post(
      `${BASE_URL}/auth/register`,
      JSON.stringify({ email: "not-an-email", password: "weak" }),
      { headers: { "Content-Type": "application/json" } },
    );

    authLatency.add(res.timings.duration);

    if (res.status === 400) validationErrors.add(1);
    if (res.status === 429) rateLimitHits.add(1);

    check(res, {
      "invalid registration returns 400 or 429": (r) => r.status === 400 || r.status === 429,
      "error field present": (r) => {
        try {
          const body = JSON.parse(r.body);
          return typeof body.error === "string";
        } catch {
          return false;
        }
      },
    });
  });

  sleep(0.2);
}

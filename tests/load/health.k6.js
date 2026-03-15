import { check, sleep } from "k6";
/**
 * k6 load test — GET /health endpoint throughput.
 *
 * Usage:
 *   k6 run tests/load/health.k6.js
 *   k6 run --vus 50 --duration 30s tests/load/health.k6.js
 *
 * Stages: ramp up → sustain → ramp down
 * Thresholds: p95 < 100ms, error rate < 1%
 */
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.API_BASE_URL || "http://localhost:3000";

const errorRate = new Rate("error_rate");
const healthLatency = new Trend("health_latency", true);

export const options = {
  stages: [
    { duration: "10s", target: 20 }, // ramp up to 20 VUs
    { duration: "30s", target: 20 }, // sustain 20 VUs
    { duration: "10s", target: 100 }, // spike to 100 VUs
    { duration: "20s", target: 100 }, // sustain spike
    { duration: "10s", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<100"], // 95th percentile under 100ms
    error_rate: ["rate<0.01"], // less than 1% errors
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/health`);

  healthLatency.add(res.timings.duration);
  errorRate.add(res.status !== 200);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "body has status ok": (r) => {
      try {
        return JSON.parse(r.body).status === "ok";
      } catch {
        return false;
      }
    },
    "response time < 100ms": (r) => r.timings.duration < 100,
  });

  sleep(0.1); // 100ms between requests per VU
}

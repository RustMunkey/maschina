import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/api-reference/runs.mdx";
export const Route = createFileRoute("/api-reference/runs")({ component: () => <Content /> });

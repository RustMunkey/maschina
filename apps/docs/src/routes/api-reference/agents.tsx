import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/api-reference/agents.mdx";
export const Route = createFileRoute("/api-reference/agents")({ component: () => <Content /> });

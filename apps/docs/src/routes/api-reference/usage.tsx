import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/api-reference/usage.mdx";
export const Route = createFileRoute("/api-reference/usage")({ component: () => <Content /> });

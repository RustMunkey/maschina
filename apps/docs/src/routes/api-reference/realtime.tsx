import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/api-reference/realtime.mdx";
export const Route = createFileRoute("/api-reference/realtime")({ component: () => <Content /> });

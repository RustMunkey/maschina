import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/api-reference/webhooks.mdx";
export const Route = createFileRoute("/api-reference/webhooks")({ component: () => <Content /> });

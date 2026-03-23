import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/guides/webhooks.mdx";
export const Route = createFileRoute("/guides/webhooks")({ component: () => <Content /> });

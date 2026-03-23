import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/api-reference/keys.mdx";
export const Route = createFileRoute("/api-reference/keys")({ component: () => <Content /> });

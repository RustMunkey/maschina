import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/api-reference/search.mdx";
export const Route = createFileRoute("/api-reference/search")({ component: () => <Content /> });

import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/api-reference/compliance.mdx";
export const Route = createFileRoute("/api-reference/compliance")({ component: () => <Content /> });

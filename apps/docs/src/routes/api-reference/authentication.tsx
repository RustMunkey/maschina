import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/api-reference/authentication.mdx";
export const Route = createFileRoute("/api-reference/authentication")({ component: () => <Content /> });

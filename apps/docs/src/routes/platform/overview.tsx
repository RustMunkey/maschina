import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/platform/overview.mdx";
export const Route = createFileRoute("/platform/overview")({ component: () => <Content /> });

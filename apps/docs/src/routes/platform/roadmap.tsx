import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/platform/roadmap.mdx";
export const Route = createFileRoute("/platform/roadmap")({ component: () => <Content /> });

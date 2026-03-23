import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/platform/nodes.mdx";
export const Route = createFileRoute("/platform/nodes")({ component: () => <Content /> });

import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/platform/marketplace.mdx";
export const Route = createFileRoute("/platform/marketplace")({ component: () => <Content /> });

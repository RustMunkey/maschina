import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/platform/economics.mdx";
export const Route = createFileRoute("/platform/economics")({ component: () => <Content /> });

import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/sdks/python.mdx";
export const Route = createFileRoute("/sdks/python")({ component: () => <Content /> });

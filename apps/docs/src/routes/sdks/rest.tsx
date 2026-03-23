import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/sdks/rest.mdx";
export const Route = createFileRoute("/sdks/rest")({ component: () => <Content /> });

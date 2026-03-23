import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/guides/realtime.mdx";
export const Route = createFileRoute("/guides/realtime")({ component: () => <Content /> });

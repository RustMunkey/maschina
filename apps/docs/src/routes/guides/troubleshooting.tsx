import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/guides/troubleshooting.mdx";
export const Route = createFileRoute("/guides/troubleshooting")({ component: () => <Content /> });

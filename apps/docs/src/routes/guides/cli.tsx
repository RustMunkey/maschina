import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/guides/cli.mdx";
export const Route = createFileRoute("/guides/cli")({ component: () => <Content /> });

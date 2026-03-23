import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/guides/models.mdx";
export const Route = createFileRoute("/guides/models")({ component: () => <Content /> });

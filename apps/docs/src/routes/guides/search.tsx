import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/guides/search.mdx";
export const Route = createFileRoute("/guides/search")({ component: () => <Content /> });

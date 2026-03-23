import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/guides/first-agent.mdx";
export const Route = createFileRoute("/guides/first-agent")({ component: () => <Content /> });

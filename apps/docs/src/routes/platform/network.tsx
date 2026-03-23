import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/platform/network.mdx";
export const Route = createFileRoute("/platform/network")({ component: () => <Content /> });

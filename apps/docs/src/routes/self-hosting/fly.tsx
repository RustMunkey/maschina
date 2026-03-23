import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/self-hosting/fly.mdx";
export const Route = createFileRoute("/self-hosting/fly")({ component: () => <Content /> });

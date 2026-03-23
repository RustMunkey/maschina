import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/self-hosting/environment.mdx";
export const Route = createFileRoute("/self-hosting/environment")({ component: () => <Content /> });

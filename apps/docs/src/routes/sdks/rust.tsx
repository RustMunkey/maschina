import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/sdks/rust.mdx";
export const Route = createFileRoute("/sdks/rust")({ component: () => <Content /> });

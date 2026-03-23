import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/sdks/typescript.mdx";
export const Route = createFileRoute("/sdks/typescript")({ component: () => <Content /> });

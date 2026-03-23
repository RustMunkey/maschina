import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/concepts.mdx";

export const Route = createFileRoute("/concepts")({
  component: () => <Content />,
});

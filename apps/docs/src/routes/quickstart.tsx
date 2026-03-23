import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/quickstart.mdx";

export const Route = createFileRoute("/quickstart")({
  component: () => <Content />,
});

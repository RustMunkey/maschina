import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/install.mdx";

export const Route = createFileRoute("/install")({
  component: () => <Content />,
});

import { createFileRoute } from "@tanstack/react-router";
import Content from "@content/changelog.mdx";

export const Route = createFileRoute("/changelog")({
  component: () => <Content />,
});

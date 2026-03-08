import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/flags")({
  component: FlagsPage,
});

function FlagsPage() {
  return <div><h1>Feature Flags</h1></div>;
}

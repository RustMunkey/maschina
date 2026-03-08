import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/agents")({
  component: ConsoleAgentsPage,
});

function ConsoleAgentsPage() {
  return <div><h1>All Agents</h1></div>;
}

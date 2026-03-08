import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/users")({
  component: ConsoleUsersPage,
});

function ConsoleUsersPage() {
  return <div><h1>All Users</h1></div>;
}

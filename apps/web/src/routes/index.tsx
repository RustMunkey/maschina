import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div>
      <h1>Maschina</h1>
      <p>Infrastructure for autonomous digital labor.</p>
      <a href="http://localhost:5173">Open App</a>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/verify-sent")({
  component: VerifySentPage,
});

function VerifySentPage() {
  return (
    <div>
      <h1>Check your email</h1>
      <p>We sent a verification link to your email address. Click it to activate your account.</p>
    </div>
  );
}

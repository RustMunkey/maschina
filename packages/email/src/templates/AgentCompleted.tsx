import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

interface Props {
  agentName: string;
  runId: string;
  dashboardUrl: string;
}

export function AgentCompleted({ agentName, runId, dashboardUrl }: Props) {
  return (
    <Html>
      <Head />
      <Preview>Your agent "{agentName}" has finished</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Agent run completed</Heading>
          <Text style={text}>
            Your agent <strong>{agentName}</strong> has finished running.
          </Text>
          <Text style={text}>
            Run ID: <code>{runId}</code>
          </Text>
          <Text style={text}>
            View the full output in your{" "}
            <a href={dashboardUrl} style={link}>
              dashboard
            </a>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#f6f9fc", fontFamily: "sans-serif" };
const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "560px",
};
const h1 = { color: "#1a1a1a", fontSize: "24px", fontWeight: "600", padding: "0 48px" };
const text = { color: "#444", fontSize: "16px", lineHeight: "26px", padding: "0 48px" };
const link = { color: "#0a0a0a", textDecoration: "underline" };

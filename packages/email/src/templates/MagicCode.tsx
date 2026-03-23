import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface Props {
  code: string;
  expiresInMinutes?: number;
}

export function MagicCode({ code, expiresInMinutes = 10 }: Props) {
  return (
    <Html>
      <Head />
      <Preview>Your Maschina sign-in code: {code}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Your sign-in code</Heading>
          <Text style={text}>Use the code below to sign in to Maschina.</Text>
          <Section style={codeContainer}>
            <Text style={codeText}>{code}</Text>
          </Section>
          <Text style={footer}>
            This code expires in {expiresInMinutes} minutes and can only be used once. If you did
            not request this, you can safely ignore this email.
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
const codeContainer = {
  backgroundColor: "#f4f4f4",
  borderRadius: "8px",
  margin: "24px 48px",
  padding: "24px",
  textAlign: "center" as const,
};
const codeText = {
  color: "#0a0a0a",
  fontSize: "36px",
  fontWeight: "700",
  letterSpacing: "8px",
  margin: "0",
};
const footer = { color: "#8898aa", fontSize: "12px", lineHeight: "20px", padding: "0 48px" };

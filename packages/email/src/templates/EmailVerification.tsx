import {
  Body,
  Button,
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
  verificationUrl: string;
  expiresInHours?: number;
}

export function EmailVerification({ verificationUrl, expiresInHours = 24 }: Props) {
  return (
    <Html>
      <Head />
      <Preview>Verify your Maschina account</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Verify your email</Heading>
          <Text style={text}>
            Click the button below to verify your email address and activate your
            Maschina account.
          </Text>
          <Section style={buttonContainer}>
            <Button href={verificationUrl} style={button}>
              Verify email
            </Button>
          </Section>
          <Text style={footer}>
            This link expires in {expiresInHours} hours. If you did not create an
            account, you can safely ignore this email.
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
const buttonContainer = { padding: "24px 48px" };
const button = {
  backgroundColor: "#0a0a0a",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: "600",
  padding: "12px 24px",
  textDecoration: "none",
};
const footer = { color: "#8898aa", fontSize: "12px", lineHeight: "20px", padding: "0 48px" };

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
  resetUrl: string;
  expiresInHours?: number;
}

export function PasswordReset({ resetUrl, expiresInHours = 1 }: Props) {
  return (
    <Html>
      <Head />
      <Preview>Reset your Maschina password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Reset your password</Heading>
          <Text style={text}>
            We received a request to reset the password for your Maschina account.
            Click the button below to choose a new password.
          </Text>
          <Section style={buttonContainer}>
            <Button href={resetUrl} style={button}>
              Reset password
            </Button>
          </Section>
          <Text style={footer}>
            This link expires in {expiresInHours} hour{expiresInHours !== 1 ? "s" : ""}.
            If you did not request a password reset, you can safely ignore this email.
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

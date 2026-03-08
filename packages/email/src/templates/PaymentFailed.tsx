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
  amountCents: number;
  updatePaymentUrl: string;
}

export function PaymentFailed({ amountCents, updatePaymentUrl }: Props) {
  const dollars = (amountCents / 100).toFixed(2);

  return (
    <Html>
      <Head />
      <Preview>Action required: payment of ${dollars} failed</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Payment failed</Heading>
          <Text style={text}>
            We were unable to collect your payment of <strong>${dollars}</strong>.
            Please update your payment method to keep your Maschina subscription active.
          </Text>
          <Section style={buttonContainer}>
            <Button href={updatePaymentUrl} style={button}>
              Update payment method
            </Button>
          </Section>
          <Text style={footer}>
            If you have questions, reply to this email or contact support.
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
  backgroundColor: "#dc2626",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: "600",
  padding: "12px 24px",
  textDecoration: "none",
};
const footer = { color: "#8898aa", fontSize: "12px", lineHeight: "20px", padding: "0 48px" };

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import * as React from "react";

interface Props {
  amountCents: number;
  description: string;
  invoiceUrl?: string;
  periodEnd: string;
}

export function BillingReceipt({ amountCents, description, invoiceUrl, periodEnd }: Props) {
  const dollars = (amountCents / 100).toFixed(2);

  return (
    <Html>
      <Head />
      <Preview>Your Maschina receipt for ${dollars}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Payment receipt</Heading>
          <Text style={text}>
            Thank you for your payment. Here is your receipt.
          </Text>
          <Text style={text}>
            <strong>Amount:</strong> ${dollars}
            <br />
            <strong>Description:</strong> {description}
            <br />
            <strong>Period end:</strong> {periodEnd}
          </Text>
          {invoiceUrl && (
            <Text style={text}>
              <a href={invoiceUrl} style={link}>
                View full invoice
              </a>
            </Text>
          )}
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

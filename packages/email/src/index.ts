export {
  sendAgentCompleted,
  sendBillingReceipt,
  sendEmailVerification,
  sendMagicCode,
  sendPasswordReset,
  sendPaymentFailed,
} from "./send.js";

export { FROM_ADDRESS } from "./client.js";

export { AgentCompleted } from "./templates/AgentCompleted.js";
export { BillingReceipt } from "./templates/BillingReceipt.js";
export { EmailVerification } from "./templates/EmailVerification.js";
export { MagicCode } from "./templates/MagicCode.js";
export { PasswordReset } from "./templates/PasswordReset.js";
export { PaymentFailed } from "./templates/PaymentFailed.js";

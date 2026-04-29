const FROM_NAME  = process.env.RESEND_FROM_NAME  || "Norbake Bakery";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "orders@norbakebroome.com";

export const emailConfig = {
  fromAddress: `${FROM_NAME} <${FROM_EMAIL}>`,
  replyTo: process.env.RESEND_REPLY_TO || FROM_EMAIL,
  bakeryEmail: process.env.BAKERY_EMAIL || "orders@norbakebroome.com",
  bakeryName: process.env.BAKERY_NAME || FROM_NAME,
  portalUrl: process.env.NEXT_PUBLIC_APP_URL || "https://orders.norbakebroome.com",
};
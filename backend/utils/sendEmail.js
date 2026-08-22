import nodemailer from "nodemailer";

// SMTP is only wired up when all three creds are present. Locally you usually
// won't have them — see the dev fallback in sendOtpEmail below.
const smtpConfigured = !!(
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS
);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST, // e.g. smtp.gmail.com
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465, // 465 = implicit TLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS, // Gmail: use an App Password, not the account password
      },
    })
  : null;

export const isEmailConfigured = () => smtpConfigured;

/**
 * Sends the OTP by email. When SMTP isn't configured (typical for local dev)
 * this does NOT throw — it logs the code to the server console and reports
 * `delivered:false` so the caller can surface a dev-only code to the tester.
 * Never depend on the console fallback in production.
 */
export const sendOtpEmail = async (to, otp, name = "") => {
  if (!smtpConfigured) {
    console.log(
      `\n──────────────────────────────────────────\n[DEV OTP] ${to} → ${otp}\n(SMTP not configured; set SMTP_HOST/SMTP_USER/SMTP_PASS to email real codes)\n──────────────────────────────────────────\n`
    );
    return { delivered: false };
  }

  await transporter.sendMail({
    from: `"CrowdShield" <${process.env.SMTP_USER}>`,
    to,
    subject: "Your CrowdShield verification code",
    html: `
      <div style="font-family:Arial,sans-serif;background:#050816;padding:32px;color:#fff;">
        <h2 style="color:#22d3ee;margin:0 0 12px;">CrowdShield Verification</h2>
        <p style="color:#cbd5e1;">Hi ${name || "there"}, your one-time verification code is:</p>
        <p style="font-size:34px;font-weight:800;letter-spacing:10px;color:#38bdf8;margin:16px 0;">${otp}</p>
        <p style="color:#64748b;font-size:13px;">Expires in 10 minutes. Didn't request this? Ignore this email.</p>
      </div>
    `,
  });
  return { delivered: true };
};

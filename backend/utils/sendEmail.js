import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,        // e.g. smtp.gmail.com
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,      // Gmail: use an App Password, not your normal password
  },
});

export const sendOtpEmail = async (to, otp, name = "") => {
  await transporter.sendMail({
    from: `"CrowdHelp" <${process.env.SMTP_USER}>`,
    to,
    subject: "Your CrowdHelp verification code",
    html: `
      <div style="font-family:Arial,sans-serif;background:#050816;padding:32px;color:#fff;">
        <h2 style="color:#22d3ee;margin:0 0 12px;">CrowdHelp Verification</h2>
        <p style="color:#cbd5e1;">Hi ${name || "there"}, your one-time verification code is:</p>
        <p style="font-size:34px;font-weight:800;letter-spacing:10px;color:#38bdf8;margin:16px 0;">${otp}</p>
        <p style="color:#64748b;font-size:13px;">Expires in 10 minutes. Didn't request this? Ignore this email.</p>
      </div>
    `,
  });
};
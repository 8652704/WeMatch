const nodemailer = require('nodemailer');

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT) || 587,
    secure: parseInt(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const FROM = () => process.env.EMAIL_FROM || `WeMatch <${process.env.SMTP_USER}>`;

async function sendCircleWelcomeEmail(toEmail, toName, ownerName, baseUrl, optOutUrl) {
  const transport = createTransport();
  if (!transport) {
    console.log(`[EMAIL] No SMTP configured — skipping welcome email to ${toEmail}`);
    return;
  }
  await transport.sendMail({
    from: FROM(),
    to: toEmail,
    subject: `${ownerName} invited you to their WeMatch circle!`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e;">
        <h2 style="color:#F0607A;">You've been invited to WeMatch! 💌</h2>
        <p>Hi ${toName},</p>
        <p><strong>${ownerName}</strong> has added you to their personal match circle on <strong>WeMatch.dating</strong> — a platform where trusted friends and family help make introductions.</p>
        <p>As part of their circle, you'll be able to suggest potential matches for them and help them find someone special.</p>
        <p style="margin:1.5rem 0;">
          <a href="${baseUrl}" style="background:linear-gradient(135deg,#F0607A,#9B6FD4);color:#fff;padding:.75rem 1.75rem;border-radius:100px;text-decoration:none;font-weight:600;">Join WeMatch →</a>
        </p>
        <p style="color:#888;font-size:.8rem;">Don't want to receive these emails? <a href="${optOutUrl}" style="color:#888;">Opt out here</a>.</p>
      </div>
    `,
    text: `Hi ${toName},\n\n${ownerName} has invited you to join their WeMatch circle.\n\nSign up at: ${baseUrl}\n\nOpt out: ${optOutUrl}`,
  });
  console.log(`[EMAIL] Circle welcome sent to ${toEmail}`);
}

async function sendCircleReminderEmail(toEmail, toName, ownerName, baseUrl, optOutUrl) {
  const transport = createTransport();
  if (!transport) {
    console.log(`[EMAIL] No SMTP configured — skipping reminder email to ${toEmail}`);
    return;
  }
  await transport.sendMail({
    from: FROM(),
    to: toEmail,
    subject: `Reminder: ${ownerName} is waiting for you on WeMatch`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e;">
        <h2 style="color:#F0607A;">Still waiting for you 💌</h2>
        <p>Hi ${toName},</p>
        <p><strong>${ownerName}</strong> invited you to join their WeMatch circle. You haven't signed up yet — it only takes a minute!</p>
        <p style="margin:1.5rem 0;">
          <a href="${baseUrl}" style="background:linear-gradient(135deg,#F0607A,#9B6FD4);color:#fff;padding:.75rem 1.75rem;border-radius:100px;text-decoration:none;font-weight:600;">Join Now →</a>
        </p>
        <p style="color:#888;font-size:.8rem;">Don't want reminders? <a href="${optOutUrl}" style="color:#888;">Opt out here</a>.</p>
      </div>
    `,
    text: `Hi ${toName},\n\n${ownerName} is still waiting for you to join their WeMatch circle.\n\nSign up at: ${baseUrl}\n\nOpt out: ${optOutUrl}`,
  });
  console.log(`[EMAIL] Circle reminder sent to ${toEmail}`);
}

module.exports = { sendCircleWelcomeEmail, sendCircleReminderEmail };

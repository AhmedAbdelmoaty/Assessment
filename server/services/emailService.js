import nodemailer from 'nodemailer';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const MAIL_FROM = process.env.MAIL_FROM || '"Learning Advisor" <no-reply@example.com>';

// Check if SMTP is configured
const SMTP_CONFIGURED = !!(process.env.SMTP_USER && process.env.SMTP_PASS);

// Create transporter only if SMTP is configured
let transporter = null;
if (SMTP_CONFIGURED) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT || '2525'),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

/**
 * Send verification email (magic link)
 */
export async function sendVerificationEmail(email, token, lang = 'en') {
  const verifyLink = `${BASE_URL}/verify?token=${token}&type=verify`;
  
  const subject = lang === 'ar' 
    ? 'فعّل حسابك - Learning Advisor' 
    : 'Activate your account - Learning Advisor';
  
  const html = lang === 'ar' ? `
    <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #8B1538;">أهلاً!</h2>
      <p>اضغط على الرابط التالي لتفعيل حسابك:</p>
      <p><a href="${verifyLink}" style="display: inline-block; padding: 12px 24px; background-color: #8B1538; color: white; text-decoration: none; border-radius: 6px;">تفعيل الحساب</a></p>
      <p style="color: #666; font-size: 14px;">الرابط صالح لمدة 15 دقيقة.</p>
      <p style="color: #999; font-size: 12px;">إذا لم تقم بإنشاء حساب، يرجى تجاهل هذا البريد.</p>
    </div>
  ` : `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #8B1538;">Hello!</h2>
      <p>Click the link below to activate your account:</p>
      <p><a href="${verifyLink}" style="display: inline-block; padding: 12px 24px; background-color: #8B1538; color: white; text-decoration: none; border-radius: 6px;">Activate Account</a></p>
      <p style="color: #666; font-size: 14px;">This link is valid for 15 minutes.</p>
      <p style="color: #999; font-size: 12px;">If you didn't create an account, please ignore this email.</p>
    </div>
  `;
  
  if (!SMTP_CONFIGURED) {
    console.log('SMTP not configured - Email would be sent to:', email);
    console.log('Verification link:', verifyLink);
    return;
  }
  
  await transporter.sendMail({
    from: MAIL_FROM,
    to: email,
    subject,
    html
  });
}

/**
 * Send password reset email
 */
export async function sendResetEmail(email, token, lang = 'en') {
  const resetLink = `${BASE_URL}/verify?token=${token}&type=reset`;
  
  const subject = lang === 'ar' 
    ? 'إعادة تعيين كلمة المرور - Learning Advisor' 
    : 'Reset your password - Learning Advisor';
  
  const html = lang === 'ar' ? `
    <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #8B1538;">إعادة تعيين كلمة المرور</h2>
      <p>لإنشاء كلمة مرور جديدة، افتح الرابط التالي:</p>
      <p><a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #8B1538; color: white; text-decoration: none; border-radius: 6px;">إعادة تعيين كلمة المرور</a></p>
      <p style="color: #666; font-size: 14px;">الرابط صالح لمدة 15 دقيقة.</p>
      <p style="color: #999; font-size: 12px;">إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد.</p>
    </div>
  ` : `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #8B1538;">Reset Your Password</h2>
      <p>To create a new password, open the link below:</p>
      <p><a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #8B1538; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
      <p style="color: #666; font-size: 14px;">This link is valid for 15 minutes.</p>
      <p style="color: #999; font-size: 12px;">If you didn't request a password reset, please ignore this email.</p>
    </div>
  `;
  
  if (!SMTP_CONFIGURED) {
    console.log('SMTP not configured - Password reset email would be sent to:', email);
    console.log('Reset link:', resetLink);
    return;
  }
  
  await transporter.sendMail({
    from: MAIL_FROM,
    to: email,
    subject,
    html
  });
}

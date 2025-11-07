import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { generateOTP, generateOTPWithExpiry, isOTPValid, hashOTP, verifyOTP } from './otp-utils.js';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,  // ✅ Keep consistent
    pass: process.env.GMAIL_APP_PASSWORD,  // ✅ Keep consistent
  },
});

export const sendNotificationEmail = async (to, title, message, type) => {
  try {
    const htmlTemplate = getEmailTemplate(title, message, type);
    
    const mailOptions = {
      from: `"PMS Team" <${process.env.GMAIL_USER}>`,  // ✅ Fixed: Use GMAIL_USER consistently
      to: to,
      subject: title,
      html: htmlTemplate
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

// Send invite email
export const sendInviteEmail = async (to, workspaceName, inviteToken, inviterName) => {
  try {
    const acceptUrl = `${process.env.FRONTEND_URL}/accept-invite?token=${inviteToken}`;
    const declineUrl = `${process.env.FRONTEND_URL}/decline-invite?token=${inviteToken}`;
    
    const htmlTemplate = getInviteEmailTemplate(workspaceName, inviterName, acceptUrl, declineUrl);
    
    const mailOptions = {
      from: `"PMS Team" <${process.env.GMAIL_USER}>`,  // ✅ Fixed: Use GMAIL_USER consistently
      to: to,
      subject: `You're invited to join ${workspaceName}`,
      html: htmlTemplate
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Invite email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Invite email sending failed:', error);
    throw error;
  }
};

// Email templates
const getEmailTemplate = (title, message, type) => {
  const getIcon = (type) => {
    switch (type) {
      case 'workspace_invite': return '🏢';
      case 'task_assigned': return '📋';
      case 'task_updated': return '✏️';
      case 'task_comment': return '💬';
      case 'member_joined': return '👋';
      default: return '📢';
    }
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: white; padding: 30px; border: 1px solid #e5e7eb; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6b7280; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            .icon { font-size: 24px; margin-bottom: 10px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="icon">${getIcon(type)}</div>
                <h1>${title}</h1>
            </div>
            <div class="content">
                <p>${message}</p>
                <p>
                    <a href="${process.env.FRONTEND_URL}/dashboard" class="button">
                        View in Dashboard
                    </a>
                </p>
            </div>
            <div class="footer">
                <p>This email was sent by PMS (Project Management System)</p>
                <p>If you no longer wish to receive these notifications, you can manage your settings in your account.</p>
            </div>
        </div>
    </body>
    </html>
  `;
};

const getInviteEmailTemplate = (workspaceName, inviterName, acceptUrl, declineUrl) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Workspace Invitation</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: white; padding: 30px; border: 1px solid #e5e7eb; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6b7280; }
            .button { display: inline-block; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px; }
            .accept { background: #10b981; }
            .decline { background: #ef4444; }
            .buttons { text-align: center; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div style="font-size: 24px; margin-bottom: 10px;">🏢</div>
                <h1>You're Invited!</h1>
            </div>
            <div class="content">
                <p>Hi there!</p>
                <p><strong>${inviterName}</strong> has invited you to join the <strong>${workspaceName}</strong> workspace on PMS.</p>
                <p>Join your team to collaborate on projects, track tasks, and stay organized together.</p>
                
                <div class="buttons">
                    <a href="${acceptUrl}" class="button accept">Accept Invitation</a>
                    <a href="${declineUrl}" class="button decline">Decline</a>
                </div>
                
                <p><small>This invitation will expire in 7 days.</small></p>
            </div>
            <div class="footer">
                <p>This email was sent by PMS (Project Management System)</p>
                <p>If you're not expecting this invitation, you can safely ignore this email.</p>
            </div>
        </div>
    </body>
    </html>
  `;
};

export { generateOTP, generateOTPWithExpiry, isOTPValid, hashOTP, verifyOTP };

export const sendOTPEmail = async (to, otp, type, name) => {
  let subject, html;
  
  if (type === 'registration') {
    subject = "Complete Your Registration - PMS";
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; border-bottom: 2px solid #007bff; padding-bottom: 20px;">
          <h1 style="color: #007bff; margin: 0;">PMS</h1>
          <p style="color: #666; margin: 5px 0;">Project Management System</p>
        </div>
        
        <div style="padding: 30px 0;">
          <h2 style="color: #333;">Welcome ${name}! 🎉</h2>
          <p style="color: #666; font-size: 16px;">Thank you for registering with us. Please use the following OTP to complete your registration:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: linear-gradient(135deg, #007bff, #0056b3); color: white; padding: 25px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 15px rgba(0,123,255,0.3);">
              <p style="margin: 0; font-size: 14px; opacity: 0.9;">Your Verification Code</p>
              <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; margin: 10px 0;">${otp}</div>
              <p style="margin: 0; font-size: 12px; opacity: 0.8;">Expires in 5 minutes</p>
            </div>
          </div>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #666; font-size: 14px;">
              <strong>Security Note:</strong> If you didn't create this account, please ignore this email. Never share this OTP with anyone.
            </p>
          </div>
        </div>
        
        <div style="text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            Best regards,<br>The PMS Team<br>
            <em>This is an automated message, please do not reply.</em>
          </p>
        </div>
      </div>
    `;
  } else if (type === 'login') {
    subject = "Login Verification - PMS";
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; border-bottom: 2px solid #28a745; padding-bottom: 20px;">
          <h1 style="color: #28a745; margin: 0;">PMS</h1>
          <p style="color: #666; margin: 5px 0;">Project Management System</p>
        </div>
        
        <div style="padding: 30px 0;">
          <h2 style="color: #333;">Login Verification 🔐</h2>
          <p style="color: #666; font-size: 16px;">Hello ${name}, we received a login attempt for your account. Please use the following OTP to complete your login:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: linear-gradient(135deg, #28a745, #20c997); color: white; padding: 25px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 15px rgba(40,167,69,0.3);">
              <p style="margin: 0; font-size: 14px; opacity: 0.9;">Your Login Code</p>
              <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; margin: 10px 0;">${otp}</div>
              <p style="margin: 0; font-size: 12px; opacity: 0.8;">Expires in 5 minutes</p>
            </div>
          </div>
          
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              <strong>⚠️ Security Alert:</strong> If you didn't try to log in, please secure your account immediately and change your password.
            </p>
          </div>
        </div>
        
        <div style="text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            Best regards,<br>The PMS Team<br>
            <em>This is an automated message, please do not reply.</em>
          </p>
        </div>
      </div>
    `;
  }

  const mailOptions = {
    from: `"PMS Team" <${process.env.GMAIL_USER}>`,
    to: to,
    subject: subject,
    html: html,
  };

  try {
    console.log(`Attempting to send ${type} OTP to:`, to);
    const info = await transporter.sendMail(mailOptions);
    console.log("OTP email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending OTP email:", error);
    return false;
  }
};

export const sendEmail = async (to, subject, html) => {
  const mailOptions = {
    from: `"PMS Team" <${process.env.GMAIL_USER}>`,
    to: to,
    subject: subject,
    html: html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};

export const sendPasswordResetOTPEmail = async (to, otp, name) => {
  const subject = "Password Reset Request - PMS";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; border-bottom: 2px solid #dc3545; padding-bottom: 20px;">
        <h1 style="color: #dc3545; margin: 0;">PMS</h1>
        <p style="color: #666; margin: 5px 0;">Project Management System</p>
      </div>
      
      <div style="padding: 30px 0;">
        <h2 style="color: #333;">Password Reset Request 🔒</h2>
        <p style="color: #666; font-size: 16px;">Hello ${name}, we received a request to reset your password. Please use the following OTP to continue:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <div style="background: linear-gradient(135deg, #dc3545, #c82333); color: white; padding: 25px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 15px rgba(220,53,69,0.3);">
            <p style="margin: 0; font-size: 14px; opacity: 0.9;">Your Reset Code</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; margin: 10px 0;">${otp}</div>
            <p style="margin: 0; font-size: 12px; opacity: 0.8;">Expires in 5 minutes</p>
          </div>
        </div>
        
        <div style="background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #721c24; font-size: 14px;">
            <strong>🔐 Security Notice:</strong> If you didn't request a password reset, please ignore this email and consider changing your password for security.
          </p>
        </div>
        
        <p style="color: #666; font-size: 14px;">This OTP is valid for 5 minutes only. After entering the OTP, you'll be able to set a new password.</p>
      </div>
      
      <div style="text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
        <p style="color: #999; font-size: 12px; margin: 0;">
          Best regards,<br>The PMS Team<br>
          <em>This is an automated message, please do not reply.</em>
        </p>
      </div>
    </div>
  `;

  const mailOptions = {
    from: `"PMS Team" <${process.env.GMAIL_USER}>`,
    to: to,
    subject: subject,
    html: html,
  };

  try {
    console.log(`Attempting to send password reset OTP to:`, to);
    const info = await transporter.sendMail(mailOptions);
    console.log("Password reset OTP email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending password reset OTP email:", error);
    return false;
  }
};

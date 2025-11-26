/**
 * Password Reset Email Template
 */
export const passwordResetTemplate = (resetUrl, username) => {
  return {
    subject: 'Password Reset Request',
    text: `
      Hi ${username || 'there'},
      
      You requested to reset your password.
      
      Please click on the link below to reset your password:
      ${resetUrl}
      
      This link will expire in 10 minutes.
      
      If you didn't request this, please ignore this email.
      
      Best regards,
      Inventory Management Team
    `,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #f9f9f9;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 10px 10px 0 0;
            margin: -30px -30px 30px -30px;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
            color: black;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: bold;
          }
          .button:hover {
            background: linear-gradient(135deg, #1d4ed8 0%, #4338ca 100%);
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #666;
            text-align: center;
          }
          .warning {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .info {
            background: #dbeafe;
            border-left: 4px solid #3b82f6;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset</h1>
          </div>
          
          <p>Hi <strong>${username || 'there'}</strong>,</p>
          
          <p>You recently requested to reset your password for your Inventory Management System account.</p>
          
          <p>Click the button below to reset your password:</p>
          
          <div style="text-align: center;">
            <a style="color: black;" href="${resetUrl}" class="button">Reset Password</a>
          </div>
          
          <div class="info">
            <strong>⏰ Important:</strong> This link will expire in <strong>10 minutes</strong> for security reasons.
          </div>
          
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #2563eb;">${resetUrl}</p>
          
          <div class="warning">
            <strong>⚠️ Security Notice:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
          </div>
          
          <div class="footer">
            <p>Best regards,<br><strong>Inventory Management Team</strong></p>
            <p style="margin-top: 10px;">This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
};

/**
 * Welcome Email Template for New Sellers
 */
export const welcomeSellerTemplate = (sellerName, email, temporaryPassword) => {
  return {
    subject: 'Welcome to Inventory Management System',
    text: `
      Welcome ${sellerName}!
      
      Your seller account has been created successfully.
      
      Login Credentials:
      Email: ${email}
      Temporary Password: ${temporaryPassword}
      
      Please login and change your password immediately for security.
      
      Login URL: ${process.env.FRONTEND_URL}/login
      
      Best regards,
      Inventory Management Team
    `,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #f9f9f9;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 10px 10px 0 0;
            margin: -30px -30px 30px -30px;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .credentials {
            background: white;
            padding: 20px;
            border-radius: 8px;
            border: 2px solid #10b981;
            margin: 20px 0;
          }
          .credentials p {
            margin: 10px 0;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: bold;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #666;
            text-align: center;
          }
          .warning {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome!</h1>
          </div>
          
          <p>Hi <strong>${sellerName}</strong>,</p>
          
          <p>Welcome to the Inventory Management System! Your seller account has been created successfully.</p>
          
          <div class="credentials">
            <h3 style="margin-top: 0; color: #10b981;">📧 Your Login Credentials:</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Temporary Password:</strong> <code style="background: #f3f4f6; padding: 5px 10px; border-radius: 4px;">${temporaryPassword}</code></p>
          </div>
          
          <div class="warning">
            <strong>🔒 Security First:</strong> Please login and change your temporary password immediately!
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" class="button">Login Now</a>
          </div>
          
          <p style="margin-top: 30px;"><strong>What you can do:</strong></p>
          <ul>
            <li>View your sales statistics</li>
            <li>Track your commission earnings</li>
            <li>See detailed sales history</li>
            <li>Monitor your performance</li>
          </ul>
          
          <div class="footer">
            <p>Best regards,<br><strong>Inventory Management Team</strong></p>
            <p style="margin-top: 10px;">Need help? Contact your administrator.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
};

/**
 * Password Changed Confirmation Email
 */
export const passwordChangedTemplate = (username) => {
  return {
    subject: 'Password Changed Successfully',
    text: `
      Hi ${username},
      
      Your password has been changed successfully.
      
      If you didn't make this change, please contact support immediately.
      
      Best regards,
      Inventory Management Team
    `,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #f9f9f9;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 10px 10px 0 0;
            margin: -30px -30px 30px -30px;
          }
          .success {
            background: #d1fae5;
            border-left: 4px solid #10b981;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .warning {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #666;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Password Changed</h1>
          </div>
          
          <p>Hi <strong>${username}</strong>,</p>
          
          <div class="success">
            <strong>✅ Success!</strong> Your password has been changed successfully.
          </div>
          
          <p>Your account is now secured with your new password. You can use it to login to your account.</p>
          
          <div class="warning">
            <strong>⚠️ Didn't make this change?</strong> If you didn't change your password, please contact support immediately.
          </div>
          
          <div class="footer">
            <p>Best regards,<br><strong>Inventory Management Team</strong></p>
          </div>
        </div>
      </body>
      </html>
    `
  };
};

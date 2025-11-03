import User from '../models/user.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { generateOTPWithExpiry, isOTPValid, hashOTP, verifyOTP, sendOTPEmail, sendPasswordResetOTPEmail } from '../libs/send-email.js';
const registerUser = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const salt = await bcrypt.genSalt(saltRounds);
    const hashPassword = await bcrypt.hash(password, salt);
    const { otp, expiresAt } = generateOTPWithExpiry();
    const hashedOTP = hashOTP(otp);
    const newUser = await User.create({
      email,
      password: hashPassword,
      name,
      otp: hashedOTP,
      otpExpiresAt: expiresAt,
      otpType: 'registration',
      isEmailVerified: false,
    });
    const emailSent = await sendOTPEmail(email, otp, 'registration', name);
    
    if (!emailSent) {
      console.error('Failed to send OTP email to:', email);
    }

    res.status(201).json({ 
      message: "Registration initiated. Please check your email for OTP.",
      userId: newUser._id,
      emailSent: emailSent
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email }).select("+password"); // password field included
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.isEmailVerified) {
      return res.status(400).json({ 
        message: "Please verify your email first",
        needsVerification: true,
        userId: user._id
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    const { otp, expiresAt } = generateOTPWithExpiry();
    user.otp = hashOTP(otp);
    user.otpExpiresAt = expiresAt;
    user.otpType = 'login';
    await user.save();
    const emailSent = await sendOTPEmail(email, otp, 'login', user.name);
    
    if (!emailSent) {
      console.error('Failed to send login OTP to:', email);
      return res.status(500).json({ message: "Failed to send OTP email" });
    }

    res.status(200).json({
      message: "OTP sent to your email. Please verify to complete login.",
      userId: user._id,
      requiresOTP: true
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (token && typeof token === 'string' && /^\d{6}$/.test(token)) {
      return res.status(400).json({ 
        message: "Please use the new OTP verification endpoint with userId and OTP" 
      });
    }
    if (typeof token === 'object' && token.userId && token.otp) {
      const { userId, otp } = token;
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.otpType === 'registration') {
        if (user.isEmailVerified) {
          return res.status(400).json({ message: "Email already verified" });
        }

        if (!isOTPValid(user.otpExpiresAt)) {
          return res.status(400).json({ message: "OTP has expired. Please request a new one." });
        }

        if (!verifyOTP(otp, user.otp)) {
          return res.status(400).json({ message: "Invalid OTP" });
        }

        user.isEmailVerified = true;
        user.otp = null;
        user.otpExpiresAt = null;
        user.otpType = null;
        user.lastLogin = new Date();
        await user.save();

        // Auto-login user after successful registration
        const authToken = jwt.sign(
          { userId: user._id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: "24h" }
        );

        // Set HTTP-only cookie for secure token storage (backward compatibility)
        res.cookie('auth_token', authToken, {
          httpOnly: true,           // Not accessible via JavaScript
          secure: process.env.NODE_ENV === 'production', // HTTPS only in production
          sameSite: 'strict',       // CSRF protection
          maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
          path: '/'                 // Available for all routes
        });

        return res.status(200).json({
          message: "Registration completed successfully! Logging you in...",
          token: authToken,
          user: {
            id: user._id,
            name: user.name,
            email: user.email
          }
        });
      }

      if (user.otpType === 'login') {
        if (!isOTPValid(user.otpExpiresAt)) {
          return res.status(400).json({ message: "OTP has expired. Please login again." });
        }

        if (!verifyOTP(otp, user.otp)) {
          return res.status(400).json({ message: "Invalid OTP" });
        }

        user.otp = null;
        user.otpExpiresAt = null;
        user.otpType = null;
        user.lastLogin = new Date();
        await user.save();

        const authToken = jwt.sign(
          { userId: user._id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: "24h" }
        );

        // Set HTTP-only cookie for secure token storage (backward compatibility)
        res.cookie('auth_token', authToken, {
          httpOnly: true,           // Not accessible via JavaScript
          secure: process.env.NODE_ENV === 'production', // HTTPS only in production
          sameSite: 'strict',       // CSRF protection
          maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
          path: '/'                 // Available for all routes
        });

        return res.status(200).json({
          message: "Login successful",
          token: authToken,
          user: {
            id: user._id,
            name: user.name,
            email: user.email
          }
        });
      }

      return res.status(400).json({ message: "Invalid OTP type" });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      if (!payload) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { userId, purpose } = payload;

      if (purpose !== "email-verification") {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await User.findById(userId);

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      if (user.isEmailVerified) {
        return res.status(400).json({ message: "Email already verified" });
      }

      user.isEmailVerified = true;
      await user.save();

      res.status(200).json({ message: "Email verified successfully. You can now log in." });

    } catch (jwtError) {
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: "Invalid verification token" });
      }
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ message: "Verification token has expired" });
      }
      throw jwtError;
    }

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const resendOTP = async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.otpType) {
      return res.status(400).json({ message: "No active OTP request found" });
    }

    const { otp, expiresAt } = generateOTPWithExpiry();

    user.otp = hashOTP(otp);
    user.otpExpiresAt = expiresAt;
    await user.save();

    const emailSent = await sendOTPEmail(user.email, otp, user.otpType, user.name);
    
    if (!emailSent) {
      console.error('Failed to resend OTP to:', user.email);
      return res.status(500).json({ message: "Failed to send OTP email" });
    }

    res.status(200).json({ 
      message: `New OTP sent to your email for ${user.otpType}` 
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Account doesn't exist" });
    }

    // Generate OTP for password reset
    const { otp, expiresAt } = generateOTPWithExpiry();

    // Save hashed OTP to user
    user.otp = hashOTP(otp);
    user.otpExpiresAt = expiresAt;
    user.otpType = 'password-reset';
    await user.save();

    // Send OTP email
    const emailSent = await sendPasswordResetOTPEmail(email, otp, user.name);
    
    if (!emailSent) {
      console.error('Failed to send password reset OTP to:', email);
      return res.status(500).json({ message: "Failed to send reset email" });
    }

    res.status(200).json({
      message: "Password reset OTP sent to your email.",
      userId: user._id
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// NEW: Verify Password Reset OTP
const verifyPasswordResetOTP = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.otpType !== 'password-reset') {
      return res.status(400).json({ message: "Invalid OTP type" });
    }

    if (!isOTPValid(user.otpExpiresAt)) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    if (!verifyOTP(otp, user.otp)) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Don't clear OTP yet - we need it for password reset verification
    // Just confirm the OTP is valid and return original OTP as resetToken
    res.status(200).json({
      message: "OTP verified successfully. You can now reset your password.",
      userId: user._id,
      resetToken: otp // Send back original OTP for password reset
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// NEW: Reset Password
const resetPassword = async (req, res) => {
  try {
    const { userId, resetToken, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.otpType !== 'password-reset') {
      return res.status(400).json({ message: "Invalid reset request" });
    }

    if (!isOTPValid(user.otpExpiresAt)) {
      return res.status(400).json({ message: "Reset token has expired. Please request a new one." });
    }

    if (!verifyOTP(resetToken, user.otp)) {
      return res.status(400).json({ message: "Invalid reset token" });
    }

    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear OTP
    user.password = hashedPassword;
    user.otp = null;
    user.otpExpiresAt = null;
    user.otpType = null;
    await user.save();

    res.status(200).json({ 
      message: "Password reset successfully. You can now log in with your new password." 
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getUserInfo = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-password -otp -otpExpiresAt -otpType')
      .populate('currentWorkspace', 'name description')
      .populate('workspaces.workspaceId', 'name description');
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        isEmailVerified: user.isEmailVerified,
        workspaces: user.workspaces,
        currentWorkspace: user.currentWorkspace
      }
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


// Update the export line
export { registerUser, loginUser, verifyEmail, resendOTP, forgotPassword, verifyPasswordResetOTP, resetPassword, getUserInfo };
import crypto from 'crypto';

export const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

export const generateOTPWithExpiry = () => {
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  return { otp, expiresAt };
};

export const isOTPValid = (expiresAt) => {
  return new Date() < new Date(expiresAt);
};

export const generateSessionToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

export const hashOTP = (otp) => {
  return crypto.createHash('sha256').update(otp).digest('hex');
};

export const verifyOTP = (inputOTP, hashedOTP) => {
  const hashedInput = crypto.createHash('sha256').update(inputOTP).digest('hex');
  return hashedInput === hashedOTP;
};

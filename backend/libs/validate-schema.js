import { z } from "zod";

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

const registerSchema = z.object({
  name: z.string().min(3, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const verifyEmailSchema = z.union([
  z.object({
    token: z.string().min(1, "Token is required"),
  }),
  z.object({
    token: z.object({
      userId: z.string().min(1, "User ID is required"),
      otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
    }),
  }),
]);

const otpVerificationSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

const resendOTPSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

// const resetPasswordSchema = z.object({
//   token: z.string().min(1, "Token is required"),
//   newPassword: z.string().min(8, "Password must be at least 8 characters long"),
//   confirmPassword: z.string().min(1, "Confirm password is required"),
// });

const emailSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member", "viewer"]),
});

const tokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

const workspaceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  color: z.string().min(1, "Color is required"),
});

const projectSchema = z.object({
  title: z.string().min(3, "Title is required"),
  description: z.string().optional(),
  status: z.enum([
    "Planning",
    "In Progress",
    "On Hold",
    "Completed",
    "Cancelled",
  ]),
  startDate: z.string(),
  dueDate: z.string().optional(),
  tags: z.string().optional(),
  members: z
    .array(
      z.object({
        user: z.string(),
        role: z.enum(["manager", "contributor", "viewer"]),
      })
    )
    .optional(),
});

const taskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional(),
  status: z.enum(["To Do", "In Progress", "Done"]),
  priority: z.enum(["Low", "Medium", "High"]),
  dueDate: z.string().min(1, "Due date is required"),
  assignees: z.array(z.string()).min(1, "At least one assignee is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const verifyResetOTPSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

const resetPasswordSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  resetToken: z.string().min(1, "Reset token is required"),
  newPassword: passwordSchema,
});

// ... existing exports ...

export {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  otpVerificationSchema,
  resendOTPSchema,
  emailSchema,
  workspaceSchema,
  projectSchema,
  taskSchema,
  inviteMemberSchema,
  tokenSchema,
  forgotPasswordSchema,
  verifyResetOTPSchema,
  resetPasswordSchema,
};
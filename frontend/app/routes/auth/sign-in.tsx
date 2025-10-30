import { signInSchema } from "@/lib/schema";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useNavigate } from "react-router";
import { useSignInMutation } from "@/hooks/use-auth";
import { useAuth } from "../../provider/auth-context";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

type SigninFormData = z.infer<typeof signInSchema>;

const SignIn = () => {
  const navigate = useNavigate();
  const { forceAuthCheck } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const form = useForm<SigninFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const { mutate, isPending } = useSignInMutation();

  const handleOnSubmit = (values: SigninFormData) => {
    mutate(values, {
      onSuccess: (data: any) => {
        if (data.requiresOTP) {
          toast.success("OTP Sent", {
            description:
              "Please check your email for a 6-digit OTP to complete login.",
          });
          navigate("/verify-otp", {
            state: {
              userId: data.userId,
              email: values.email,
              type: "login",
              message:
                "Please enter the 6-digit OTP sent to your email to complete login.",
            },
          });
        } else {
          toast.success("Login successful!");

          // Force auth check to update context with HTTP-only cookie
          forceAuthCheck().then(() => {
            navigate("/dashboard");
          }).catch(() => {
            // Even if force check fails, try to navigate
            navigate("/dashboard");
          });
        }
      },
      onError: (error: any) => {
        const errorMessage =
          error.response?.data?.message || "An error occurred";

        if (error.response?.data?.needsVerification) {
          toast.error("Email verification required", {
            description: "Please verify your email first.",
          });
          navigate("/verify-otp", {
            state: {
              userId: error.response.data.userId,
              email: values.email,
              type: "registration",
              message: "Please complete your email verification first.",
            },
          });
        } else {
          toast.error(errorMessage);
        }
      },
    });
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'var(--Linear-Gradient-for-Login, linear-gradient(180deg, rgba(0, 122, 255, 0.40) 0%, rgba(242, 118, 27, 0.40) 100%))',
        backgroundSize: 'cover'
      }}
    >
      <div className="w-full max-w-[975px] h-[650px] bg-white rounded-2xl overflow-hidden shadow-lg flex gap-2.5 p-2.5">
        {/* Left Panel - Branding */}
        <div className="flex-1 bg-gradient-to-br from-sky-200 to-sky-300 rounded-2xl relative overflow-hidden">
          {/* Logo and Organization Name */}
          <div className="absolute left-1/2 -translate-x-1/2 top-7 flex items-center gap-6 z-10">
            <div className="w-[60px] h-[60px] relative">
              <img
                src="/assets/a8ebdf5975d6d9ab7f5064a60b7a388fe436a8bb.png"
                alt="Mathura Vrindavan Development Authority Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="text-[28px] font-normal leading-normal text-transparent bg-clip-text bg-gradient-to-r from-[#f2761b] to-black drop-shadow-md whitespace-pre">
              <p className="mb-0">Mathura Vrindavan </p>
              <p>Development Authority</p>
            </div>
          </div>

          {/* Circular Image Collage */}
          <div className="absolute left-[48.88px] top-[150px] w-[375px] h-[376.248px]">
            {/* Top right image - Ellipse 1167 */}
            <div className="absolute left-[216.83px] top-[5.13px] w-[153.22px] h-[194.76px]">
              <img
                src="/assets/4e5638f48cc36e54dcf90d90636cb9e3eeb1a734.png"
                alt=""
                className="block max-w-none w-full h-full"
                style={{ width: '153.22px', height: '194.76px' }}
              />
            </div>
            {/* Top left image - Vector 28 */}
            <div className="absolute left-[26.21px] top-0 w-[213.064px] h-[134.913px]">
              <img
                src="/assets/b8e7e92c30a0039b583930d7875865552bd1aba8.png"
                alt=""
                className="block max-w-none w-full h-full"
                style={{ width: '213.064px', height: '134.913px' }}
              />
            </div>
            {/* Bottom left image - Vector 29 (optimized version) */}
            <div 
              className="absolute flex items-center justify-center left-[-41.8px] top-[79.07px]" 
              style={{ 
                height: '0px', 
                width: '0px' 
              }}
            > 
              <div className="flex-none" style={{ transform: 'rotate(-71.125deg)' }}> 
                <div 
                  className="relative w-[213.064px] h-[134.913px]" 
                  style={{ 
                    top: '8.29rem', 
                    left: '-5.398rem' 
                  }}
                > 
                  <img 
                    alt="" 
                    className="block max-w-none w-full h-full" 
                    src="/assets/3df9bb910847f92ec63648a7f818c7d8eb2dfd64.png" 
                    style={{ 
                      width: '213.064px', 
                      height: '134.913px' 
                    }} 
                  /> 
                </div> 
              </div> 
            </div>
            {/* Bottom center image - Vector 30 (optimized with precise implementation) */}
            <div
              className="absolute flex items-center justify-center left-[35.07px] top-[198.82px]"
              style={{
                height: 'calc(0px)',
                width: 'calc(0px)'
              }}
            >
              <div className="flex-none" style={{ transform: 'rotate(-143.789deg)' /* rotate(216.211deg) */ }}>
                <div 
                  className="relative w-[213.064px] h-[136.066px]"
                  style={{
                    bottom: '1.3rem',
                    right: '10.88rem'
                  }}
                >
                  <img
                    src="/assets/ff2affc0e980f78fb25f86de9ab527d1d4b2fa98.png"
                    alt=""
                    className="block max-w-none w-full h-full"
                    style={{ width: '213.064px', height: '136.066px' }}
                  />
                </div>
              </div>
            </div>
            {/* Right image - Vector 31 (optimized with precise implementation) */}
            <div
              className="absolute flex items-center justify-center left-[174.91px] top-[136.41px]"
              style={{
                height: 'calc(0px)',
                width: 'calc(0px)'
              }}
            >
              <div className="flex-none" style={{ transform: 'rotate(142.535deg)' }}>
                <div 
                  className="relative w-[213.064px] h-[136.952px]"
                  style={{
                    bottom: '10.72rem',
                    right: '2.1rem'
                  }}
                >
                  <img
                    src="/assets/76696078b52786db2907040e743a1286eadf36a7.png"
                    alt=""
                    className="block max-w-none w-full h-full"
                    style={{ width: '213.064px', height: '136.952px' }}
                  />
                </div>
              </div>
            </div>
            {/* White center circle to create ring effect */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-br from-sky-200 to-sky-300 rounded-full"
              style={{ width: '140px', height: '140px' }}
            />
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-[360px] flex flex-col gap-6">
            {/* Form Container */}
            <div className="flex flex-col gap-8">
              {/* Header */}
              <div className="flex flex-col gap-2.5">
                <h1 className="text-2xl font-semibold text-[#1a1a1a]">Login</h1>
                <p className="text-sm text-gray-500">Sign in to your account</p>
              </div>

              {/* Form Fields */}
              <div className="flex flex-col gap-5">
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(handleOnSubmit)}
                    noValidate
                    className="flex flex-col gap-4"
                  >
                    {/* Email Field */}
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm text-[#333333] px-4">Email</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type="email"
                                placeholder="Enter Email"
                                className="h-12 bg-[#f2f2f2] border-[0.5px] border-neutral-200 rounded-md px-4 text-sm placeholder:text-gray-500"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Password Field */}
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm text-[#333333] px-4">Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter password"
                                className="h-12 bg-[#f2f2f2] border-[0.5px] border-neutral-200 rounded-md px-4 pr-12 text-sm placeholder:text-gray-500"
                                {...field}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[#4d4d4d] hover:text-[#1a1a1a]"
                              >
                                {showPassword ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Remember Me & Forgot Password */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="remember"
                          checked={rememberMe}
                          onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                          className="w-4 h-4 border-2 border-[#949291] rounded-[2px]"
                        />
                        <label
                          htmlFor="remember"
                          className="text-sm text-[#1a1a1a] cursor-pointer"
                        >
                          Remember me
                        </label>
                      </div>
                      <Link
                        to="/forgot-password"
                        className="text-xs text-[#007aff] hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>

                    {/* Sign In Button */}
                    <Button
                      type="submit"
                      disabled={isPending}
                      className="w-full h-10 bg-[#007aff] hover:bg-[#0066cc] text-white font-bold text-[15px] rounded-md px-6 py-2.5 transition-colors"
                    >
                      {isPending ? "Signing in..." : "Sign in"}
                    </Button>
                  </form>
                </Form>
              </div>
            </div>

            {/* Divider */}
            <div className="h-[0.5px] bg-neutral-200 w-full" />

            {/* Sign Up Link */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#1a1a1a]">Dont have an account?</span>
              <Link to="/sign-up" className="text-[#007aff] hover:underline">
                Sign up now
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;

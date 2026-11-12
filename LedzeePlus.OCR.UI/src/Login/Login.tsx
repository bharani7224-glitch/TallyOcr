import React, { useState } from 'react';
import {
  FiMail,
  FiLock,
  FiEye,
  FiEyeOff,
  FiCheckCircle,
  FiAlertCircle,
  FiArrowRight,
  FiX,
  FiCheck,
  FiZap,
  FiShield,
  FiDatabase,
  FiLayers,
} from 'react-icons/fi';
import navanalaLogo from '../assets/navanala-logo.png';
import { authService } from '../services/authService';

const CURRENT_YEAR = new Date().getFullYear();
export interface LoginProps {
  onLoginSuccess?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);

  // Form Validation
  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      newErrors.email = 'Email address is required.';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        newErrors.email = 'Please enter a valid email address.';
      }
    }

    if (!password) {
      newErrors.password = 'Password is required.';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginSuccess(false);
    setGeneralError(null);

    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const result = await authService.validateUser(email, password);
      setIsLoading(false);

      if (!result.success) {
        if (result.field === 'email') {
          setErrors((prev) => ({ ...prev, email: result.error }));
        } else if (result.field === 'password') {
          setErrors((prev) => ({ ...prev, password: result.error }));
        } else {
          setGeneralError(result.error || 'Authentication failed. Please verify credentials.');
        }
        return;
      }

      setLoginSuccess(true);
      setTimeout(() => {
        onLoginSuccess?.();
      }, 400);
    } catch (err: any) {
      setIsLoading(false);
      setGeneralError(err.message || 'Error occurred while verifying user.');
    }
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) return;
    setForgotSubmitted(true);
    setTimeout(() => {
      setForgotSubmitted(false);
      setShowForgotModal(false);
      setForgotEmail('');
    }, 2200);
  };

  return (
    <div className="min-h-screen w-full overflow-y-auto lg:overflow-hidden bg-[#9ACD32] flex flex-col lg:flex-row relative selection:bg-[#183B2A]/20 selection:text-[#183B2A]">
      {/* ============================================================== */}
      {/* ANIMATED BACKGROUND (Clean Crisp Green Side, No White Haze)    */}
      {/* ============================================================== */}
      <div className="hidden lg:block absolute -bottom-24 right-20 w-[460px] h-[460px] rounded-full bg-[#183B2A]/15 blur-[90px] animate-fluidMorph2 pointer-events-none z-0" />

      {/* ============================================================== */}
      {/* SVG ORGANIC CURVED S-WAVE (With Gentle Wave Undulation)        */}
      {/* ============================================================== */}
      <div className="hidden lg:block absolute inset-0 h-full w-full pointer-events-none z-10 overflow-hidden">
        <svg
          className="h-full w-full fill-white transition-all duration-700 animate-waveBreathe"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
        >
          <path d="M0,0 L320,0 C350,180 520,340 550,500 C580,660 420,840 380,1000 L0,1000 Z" />
        </svg>
      </div>

      {/* ============================================================== */}
      {/* ANIMATED BACKGROUND GLOWS (White Side Only)                    */}
      {/* ============================================================== */}
      <div className="hidden lg:block absolute top-1/4 left-8 w-[440px] h-[440px] rounded-full bg-[#9ACD32]/10 blur-[100px] animate-fluidMorph2 pointer-events-none z-15" />

      {/* ============================================================== */}
      {/* LEFT SECTION (55%): CLEAN WHITE WITH UNIQUE OCR SHOWCASE (Desktop) */}
      {/* ============================================================== */}
      <div className="hidden lg:flex w-full lg:w-[55%] h-full bg-white lg:bg-transparent text-slate-800 p-8 sm:p-12 lg:p-16 relative z-20 flex-col justify-between overflow-hidden">
        {/* Top Brand Header */}
        <div className="relative z-10 flex items-center space-x-3.5">
          <img
            src={navanalaLogo}
            alt="NavaNala Technologies"
            className="h-9 sm:h-10 w-auto object-contain"
          />
          <span className="hidden sm:inline-block h-6 w-[1px] bg-slate-200" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            SMART OCR PLATFORM
          </span>
        </div>

        {/* Center: Unique High-Tech Smart OCR Presentation (No Boxy Image Mockup) */}
        <div className="relative z-10 my-auto py-6 max-w-[480px]">
          {/* Eyebrow Pill */}
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#EAF5D8] border border-[#9ACD32]/40 text-[#558210] text-[11px] font-bold mb-4 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#9ACD32] animate-pulse" />
            <span>Autonomous AI Invoice Engine</span>
          </div>

          {/* Prominent Hero Heading */}
          <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-black text-[#183B2A] tracking-tight leading-[1.12]">
            Smart Invoice <br />
            <span className="bg-gradient-to-r from-[#558210] via-[#659918] to-[#9ACD32] bg-clip-text text-transparent">
              Processing & Tally Sync.
            </span>
          </h2>

          <p className="mt-3 text-xs sm:text-sm text-slate-500 leading-relaxed font-normal max-w-[420px]">
            Automate invoice extraction and sync your data seamlessly with Tally.
          </p>

          {/* Unique 4-Card Feature Matrix */}
          <div className="mt-7 grid grid-cols-2 gap-3 max-w-[440px]">
            <div className="p-3.5 rounded-2xl bg-[#F8FBF3] border border-[#EAF5D8] shadow-sm hover:border-[#9ACD32]/60 hover:shadow-md transition-all duration-200">
              <div className="w-8 h-8 rounded-xl bg-white border border-[#EAF5D8] flex items-center justify-center mb-2.5 shadow-xs">
                <FiZap className="w-4 h-4 text-[#659918]" />
              </div>
              <div className="text-xs font-bold text-[#183B2A]">99.8% Neural OCR</div>
              <div className="text-[10.5px] text-slate-500 mt-0.5">Automated field extraction</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F8FBF3] border border-[#EAF5D8] shadow-sm hover:border-[#9ACD32]/60 hover:shadow-md transition-all duration-200">
              <div className="w-8 h-8 rounded-xl bg-white border border-[#EAF5D8] flex items-center justify-center mb-2.5 shadow-xs">
                <FiDatabase className="w-4 h-4 text-[#659918]" />
              </div>
              <div className="text-xs font-bold text-[#183B2A]">Direct Tally Bridge</div>
              <div className="text-[10.5px] text-slate-500 mt-0.5">Instant XML & ODBC Sync</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F8FBF3] border border-[#EAF5D8] shadow-sm hover:border-[#9ACD32]/60 hover:shadow-md transition-all duration-200">
              <div className="w-8 h-8 rounded-xl bg-white border border-[#EAF5D8] flex items-center justify-center mb-2.5 shadow-xs">
                <FiShield className="w-4 h-4 text-[#659918]" />
              </div>
              <div className="text-xs font-bold text-[#183B2A]">GST Reconciliation</div>
              <div className="text-[10.5px] text-slate-500 mt-0.5">Multi-tax compliance check</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F8FBF3] border border-[#EAF5D8] shadow-sm hover:border-[#9ACD32]/60 hover:shadow-md transition-all duration-200">
              <div className="w-8 h-8 rounded-xl bg-white border border-[#EAF5D8] flex items-center justify-center mb-2.5 shadow-xs">
                <FiLayers className="w-4 h-4 text-[#659918]" />
              </div>
              <div className="text-xs font-bold text-[#183B2A]">Zero Manual Entry</div>
              <div className="text-[10.5px] text-slate-500 mt-0.5">Autonomous ledger posting</div>
            </div>
          </div>
        </div>

        {/* Bottom Left Footer Note */}
        <div className="relative z-10 pt-2 text-[11px] text-slate-400">
          <span>&copy; {CURRENT_YEAR} NavaNala Technologies &bull; Powered by Smart OCR</span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* RIGHT SECTION (45%): CARD (Fully responsive on mobile & desktop) */}
      {/* ============================================================== */}
      <div className="w-full lg:w-[45%] min-h-screen lg:h-full bg-[#9ACD32] lg:bg-transparent text-slate-800 p-4 sm:p-8 lg:p-12 relative z-20 flex flex-col justify-center items-center py-8">
        <div className="w-full max-w-[390px] mx-auto bg-white p-6 sm:p-8 rounded-3xl shadow-[0_20px_50px_rgba(36,69,47,0.12)] border border-[#EAF5D8]">
          {/* Form Header: Official NavaNala Logo */}
          <div className="mb-6 flex justify-center">
            <img
              src={navanalaLogo}
              alt="NavaNala Technologies"
              className="h-10 sm:h-11 w-auto object-contain"
            />
          </div>

          {/* General Error Alert Banner */}
          {generalError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start space-x-2 text-red-700 animate-fadeIn text-xs shadow-xs">
              <FiAlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-bold block">Authentication Failed</span>
                {generalError}
              </div>
            </div>
          )}

          {/* Success Alert Banner */}
          {loginSuccess && (
            <div className="mb-4 p-3 rounded-xl bg-[#EAF5D8] border border-[#9ACD32]/60 flex items-start space-x-2 text-[#183B2A] animate-fadeIn text-xs shadow-xs">
              <FiCheckCircle className="w-4 h-4 text-[#659918] mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-bold block text-[#183B2A]">Sign in successful!</span>
                Connecting to workspace...
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
            {/* Email Address */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-bold text-slate-800 mb-1"
              >
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9ACD32]">
                  <FiMail className="w-4 h-4 text-[#9ACD32]" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                    setGeneralError(null);
                  }}
                  placeholder="Enter your email address"
                  className={`w-full pl-10 pr-4 py-2.5 bg-white text-slate-900 font-semibold text-xs sm:text-sm rounded-xl border shadow-xs ${errors.email
                    ? 'border-red-500 focus:ring-red-300/30 focus:border-red-500'
                    : 'border-slate-200 hover:border-slate-300 focus:border-[#9ACD32] focus:ring-2 focus:ring-[#9ACD32]/35'
                    } focus:outline-none transition-all duration-150 placeholder-slate-400`}
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-[11px] text-red-600 font-medium flex items-center space-x-1">
                  <FiAlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span>{errors.email}</span>
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-bold text-slate-800 mb-1"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9ACD32]">
                  <FiLock className="w-4 h-4 text-[#9ACD32]" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) {
                      setErrors((prev) => ({ ...prev, password: undefined }));
                    }
                    setGeneralError(null);
                  }}
                  placeholder="Enter your password"
                  className={`w-full pl-10 pr-10 py-2.5 bg-white text-slate-900 font-semibold text-xs sm:text-sm rounded-xl border shadow-xs ${errors.password
                    ? 'border-red-500 focus:ring-red-300/30 focus:border-red-500'
                    : 'border-slate-200 hover:border-slate-300 focus:border-[#9ACD32] focus:ring-2 focus:ring-[#9ACD32]/35'
                    } focus:outline-none transition-all duration-150 placeholder-slate-400`}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 focus:outline-none transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <FiEyeOff className="w-4 h-4" />
                  ) : (
                    <FiEye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-[11px] text-red-600 font-medium flex items-center space-x-1">
                  <FiAlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span>{errors.password}</span>
                </p>
              )}
            </div>

            {/* Options: Remember me & Forgot Password? */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#9ACD32] rounded border-slate-300 text-[#9ACD32] focus:ring-[#9ACD32] cursor-pointer"
                />
                <span className="text-xs text-slate-600 font-medium">Remember me</span>
              </label>

              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-xs text-[#9ACD32] hover:text-[#84b525] font-bold hover:underline transition-colors focus:outline-none"
              >
                Forgot Password?
              </button>
            </div>

            {/* Login Button in Theme Color #9ACD32 */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-5 rounded-2xl font-bold text-white bg-[#9ACD32] hover:bg-[#8cc228] active:bg-[#7ea620] shadow-md shadow-[#9ACD32]/30 focus:outline-none focus:ring-4 focus:ring-[#9ACD32]/30 transition-all duration-150 transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-75 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-2 text-sm cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        strokeWidth="4"
                        stroke="currentColor"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <FiArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Bottom Footer Links */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span className="hover:text-slate-700 cursor-pointer transition-colors">Terms and Services</span>
            <span className="hover:text-slate-700 cursor-pointer transition-colors">Contact Support</span>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative text-slate-800">
            <button
              onClick={() => {
                setShowForgotModal(false);
                setForgotSubmitted(false);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
              aria-label="Close"
            >
              <FiX className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-[#183B2A] mb-1">
              Reset Password
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter your registered work email to receive password reset instructions.
            </p>

            {forgotSubmitted ? (
              <div className="p-3 bg-[#EAF5D8] text-[#183B2A] rounded-xl text-xs font-semibold flex items-center space-x-2 border border-[#9ACD32]/50">
                <FiCheck className="w-4 h-4 text-[#9ACD32] flex-shrink-0" />
                <span>Recovery link sent! Please check your inbox.</span>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#183B2A] mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#F8FBF3] border border-[#EAF5D8] text-[#183B2A] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9ACD32]/30 focus:border-[#9ACD32]"
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-[#183B2A] bg-[#9ACD32] hover:bg-[#8cc228] rounded-xl transition shadow-sm"
                  >
                    Send Recovery Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;

import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-12 bg-primary-600">
        <div className="max-w-md">
          <h1 className="text-4xl font-bold text-white mb-4">Complens.ai</h1>
          <p className="text-xl text-primary-100 mb-8">
            AI-native marketing automation that thinks like your best marketer.
          </p>
          <ul className="space-y-4">
            <li className="flex items-start gap-3 text-primary-100">
              <svg className="w-6 h-6 text-primary-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Visual workflow builder - drag, drop, connect</span>
            </li>
            <li className="flex items-start gap-3 text-primary-100">
              <svg className="w-6 h-6 text-primary-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>AI-powered decisions and content generation</span>
            </li>
            <li className="flex items-start gap-3 text-primary-100">
              <svg className="w-6 h-6 text-primary-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Multi-channel: SMS, email, chat, and more</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Right side - auth form */}
      <div className="flex-1 flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-20 xl:px-24 bg-white">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <h1 className="text-2xl font-bold text-primary-600">Complens.ai</h1>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

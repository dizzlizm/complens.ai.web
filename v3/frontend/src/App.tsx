/**
 * Hello World App - Minimal version to verify Android build works
 */

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-800 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Hello World!
        </h1>

        <p className="text-gray-600 mb-4">
          Complens v3 Android App
        </p>

        <div className="bg-green-100 text-green-800 rounded-lg px-4 py-2 text-sm font-medium">
          Build successful - App is running!
        </div>

        <p className="text-gray-400 text-xs mt-4">
          React + Capacitor + Android
        </p>
      </div>
    </div>
  );
}

export default App;

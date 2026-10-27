import { CORE_VERSION } from '@evm/core';

export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-800">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">EVM Cost Tracker</h1>
        <p className="mt-2 text-sm text-slate-500">Scaffold — core v{CORE_VERSION}</p>
      </div>
    </main>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { ApiStatus } from '../features/system-status/api-status';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Vertex OS</h1>
        <p className="mt-2 text-slate-600">Internal operating platform of Vertex Media.</p>
      </header>
      <ApiStatus />
    </main>
  );
}

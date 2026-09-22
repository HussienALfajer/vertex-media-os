import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppRouter } from './router';
import './styles.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Vertex OS: #root element is missing from index.html');
}

const queryClient = new QueryClient();
const router = createAppRouter();

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

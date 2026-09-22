import { useRouter } from '@tanstack/react-router';
import type { UiLinkProps } from '@vertex-os/ui';

/**
 * The application's adapter from design-system links to TanStack Router: a real anchor
 * (new-tab, copy-link and modifier clicks keep native behaviour) whose plain left-click
 * navigates client-side. Router coupling stays here, outside @vertex-os/ui.
 */
export function RouterLink({ href, onClick, target, children, ...props }: UiLinkProps) {
  const router = useRouter();
  return (
    <a
      {...props}
      href={href}
      target={target}
      onClick={(event) => {
        onClick?.(event);
        const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (event.defaultPrevented || event.button !== 0 || modified || target) return;
        event.preventDefault();
        void router.navigate({ href });
      }}
    >
      {children}
    </a>
  );
}

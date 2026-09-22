import { Icon } from '../icons/icon';

/**
 * Indeterminate activity glyph. It is decorative: the surrounding text (a pending label or
 * a status message) states what is happening. Under reduced motion it is static (§18).
 */
export function Spinner() {
  return (
    <span className="vx-spinner" aria-hidden="true">
      <Icon name="progress" />
    </span>
  );
}

import { TOKEN_CATALOG, TechnicalId, useUiSettings, type TokenInfo } from '@vertex-os/ui';
import { useLabText } from './lab-text';

/*
 * Token specimens paint each token's own value, which utilities cannot express; this file is
 * the lab's single documented exception to the no-`style` rule (apps/web/eslint.config.mjs).
 */

const byPrefix = (prefix: string) => TOKEN_CATALOG.filter((token) => token.name.startsWith(prefix));

function TokenName({ token }: { token: TokenInfo }) {
  return (
    <span className="type-secondary">
      <TechnicalId>{token.name}</TechnicalId>
    </span>
  );
}

/** Every colour role of one group with its current-theme value; switch theme to compare. */
export function ColorRoles({ prefix, title }: { prefix: string; title: string }) {
  const tokens = byPrefix(prefix);
  return (
    <div className="flex flex-col gap-actions">
      <h3 className="type-subheading">{title}</h3>
      <ul className="grid gap-actions medium:grid-cols-2 wide:grid-cols-3">
        {tokens.map((token) => (
          <li key={token.name} className="flex items-center gap-icon-label">
            <span
              aria-hidden="true"
              className="border border-default"
              style={{
                background: `var(${token.variable})`,
                inlineSize: '2.5rem',
                blockSize: '2.5rem',
                flex: 'none',
              }}
            />
            <span className="flex flex-col">
              <TokenName token={token} />
              {/* Token metadata is English: language-tagged and isolated inside Arabic pages. */}
              <span className="type-secondary text-secondary">
                <bdi lang="en" dir="ltr">
                  {token.description}
                </bdi>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Text/background pairs as actually rendered, in the current theme. */
export function ColorPairs() {
  const t = useLabText();
  const pairs: readonly [string, string, string][] = [
    [
      '--vx-color-text-primary',
      '--vx-color-background-canvas',
      t('نص أساسي على اللوحة', 'Primary text on canvas'),
    ],
    [
      '--vx-color-text-secondary',
      '--vx-color-background-subtle',
      t('نص ثانوي على الخلفية الهادئة', 'Secondary text on subtle'),
    ],
    [
      '--vx-color-action-primary-foreground',
      '--vx-color-action-primary-background',
      t('إجراء أساسي', 'Primary action'),
    ],
    [
      '--vx-color-state-selected-foreground',
      '--vx-color-state-selected-background',
      t('عنصر محدد', 'Selected item'),
    ],
    [
      '--vx-color-brand-accent',
      '--vx-color-background-surface',
      t('لمسة الهوية', 'Identity accent'),
    ],
  ];
  return (
    <ul className="grid gap-actions medium:grid-cols-2">
      {pairs.map(([foreground, background, label]) => (
        <li
          key={label}
          className="p-surface-padding border border-subtle"
          style={{ color: `var(${foreground})`, background: `var(${background})` }}
        >
          <span className="type-label">{label}</span>{' '}
          <span className="type-secondary">Aa ١٢٣ 123</span>
        </li>
      ))}
    </ul>
  );
}

/** Semantic spacing roles drawn at their real inline size. */
export function SpacingScale() {
  return (
    <ul className="flex flex-col gap-actions">
      {byPrefix('space.').map((token) => (
        <li key={token.name} className="grid items-center gap-icon-label medium:grid-cols-2">
          <TokenName token={token} />
          <span
            aria-hidden="true"
            className="bg-subtle border border-strong"
            style={{ inlineSize: `var(${token.variable})`, blockSize: '0.75rem' }}
          />
        </li>
      ))}
    </ul>
  );
}

/** Radius and elevation roles on real surfaces. */
export function ShapeSpecimens() {
  const radii = byPrefix('radius.');
  const shadows = byPrefix('shadow.');
  return (
    <div className="flex flex-col gap-section">
      <ul className="flex flex-wrap gap-toolbar-groups">
        {radii.map((token) => (
          <li key={token.name} className="flex flex-col items-center gap-actions">
            <span
              aria-hidden="true"
              className="bg-surface border border-strong"
              style={{
                borderRadius: `var(${token.variable})`,
                inlineSize: '4rem',
                blockSize: '4rem',
              }}
            />
            <TokenName token={token} />
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-section">
        {shadows.map((token) => (
          <li key={token.name} className="flex flex-col items-center gap-actions">
            <span
              aria-hidden="true"
              className="bg-raised border border-default"
              style={{ boxShadow: `var(${token.variable})`, inlineSize: '8rem', blockSize: '4rem' }}
            />
            <TokenName token={token} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Each family rendered alone, so the delivered faces can be inspected. */
export function FontFamilies() {
  const families: readonly [string, string][] = [
    ['--vx-font-family-arabic', 'نظام تشغيل داخلي — مُحَمَّدٌ يَكْتُبُ التَّقْرِيرَ'],
    ['--vx-font-family-latin', 'Internal operating platform — 0123456789'],
    ['--vx-font-family-mono', 'VX-2026-014 · iam.users.manage-access'],
    ['--vx-font-family-ui', 'المشروع VX-2026-014 · Campaign-v2.pdf'],
  ];
  return (
    <ul className="flex flex-col gap-actions">
      {families.map(([variable, sample]) => (
        <li key={variable} className="flex flex-col">
          <span className="type-secondary text-secondary">
            <TechnicalId>{variable}</TechnicalId>
          </span>
          <span className="type-body-long" style={{ fontFamily: `var(${variable})` }}>
            {sample}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The fixed categorical order of chart series (§37.1), for the future chart component. */
export function ChartSeries() {
  return (
    <ul className="flex flex-wrap gap-toolbar-groups">
      {byPrefix('color.chart.').map((token) => (
        <li key={token.name} className="flex items-center gap-icon-label">
          <span
            aria-hidden="true"
            style={{
              background: `var(${token.variable})`,
              inlineSize: '1.5rem',
              blockSize: '1.5rem',
            }}
          />
          <TokenName token={token} />
        </li>
      ))}
    </ul>
  );
}

/** Non-visual roles (motion, layers, sizes) listed with their current computed value. */
export function TokenTable({ prefix, caption }: { prefix: string; caption: string }) {
  const t = useLabText();
  // Re-render on mode changes so density- and theme-dependent values stay current.
  useUiSettings();
  const tokens = byPrefix(prefix);
  const value = (token: TokenInfo) =>
    typeof document === 'undefined'
      ? ''
      : getComputedStyle(document.documentElement).getPropertyValue(token.variable).trim();
  return (
    <table className="w-full">
      <caption className="type-label text-start">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="type-table-heading text-secondary text-start">
            {t('الرمز', 'Token')}
          </th>
          <th scope="col" className="type-table-heading text-secondary text-end">
            {t('القيمة الحالية', 'Current value')}
          </th>
        </tr>
      </thead>
      <tbody>
        {tokens.map((token) => (
          <tr key={token.name} className="border-b border-subtle">
            <td className="py-actions">
              <TokenName token={token} />
            </td>
            <td className="py-actions text-end">
              <TechnicalId>{value(token)}</TechnicalId>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

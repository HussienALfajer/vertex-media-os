import { createProjectGraphAsync } from '@nx/devkit';
import { ESLint } from 'eslint';
import { resolve } from 'node:path';

// Build the graph before ESLint loads the Nx boundary rule, including on a fresh clone.
await createProjectGraphAsync();

const nxRule = '@nx/enforce-module-boundaries';
const importsRule = 'no-restricted-imports';
const syntaxRule = 'no-restricted-syntax';
const boundaryRules = new Set([nxRule, importsRule, syntaxRule]);

// Fragments of the `no-restricted-syntax` messages, so each case proves which selector fired.
const privateSubpath = 'dynamic imports and type queries of subpaths';
const computedImport = 'computed dynamic imports';
const rawEnvironment = 'Read raw environment variables';
const unsafeRawSql = '$executeRawUnsafe is reserved for tests';
const unsafeRawQuery = '$queryRawUnsafe is reserved for tests';
const createRequireBan = 'createRequire bypasses the import boundaries';

// [id, project, code, rule, message fragment?, virtual file relative to the project?]
const violations = [
  ['V1', 'apps/web', "import '@vertex-os/iam';", nxRule, 'scope:web'],
  ['V2', 'apps/web', "import '@vertex-os/iam-persistence';", nxRule, 'scope:web'],
  ['V3', 'packages/ui', "import '@vertex-os/iam';", nxRule, 'layer:ui'],
  ['V4', 'packages/database', "import '@vertex-os/iam';", nxRule, 'layer:infrastructure'],
  // Nx detects the forbidden reverse edge as a cycle before evaluating its tag constraint.
  [
    'V5',
    'packages/database',
    "import '@vertex-os/iam-persistence';",
    nxRule,
    'Circular dependency',
  ],
  ['V6', 'domains/iam', "import '@vertex-os/database';", nxRule, 'layer:domain'],
  ['V7', 'domains/iam', "import '@vertex-os/iam-persistence';", nxRule, 'Circular dependency'],
  ['V8', 'domains/iam', "import 'pg';", nxRule, 'pg'],
  ['V9', 'domains/iam', "import '@prisma/client';", nxRule, '@prisma'],
  ['V10', 'domains/iam-persistence', "import '@prisma/client';", nxRule, '@prisma'],
  ['V11', 'domains/iam-persistence', "import 'pg';", nxRule, 'pg'],
  ['V12', 'domains/iam-persistence', "import '@nestjs/common';", nxRule, '@nestjs'],
  ['V13', 'apps/api', "import '@vertex-os/iam/persistence';", importsRule],
  ['V14', 'apps/api', "import '@vertex-os/database/iam';", importsRule],
  ['V15', 'apps/api', "import '@vertex-os/iam-persistence/src/index.js';", importsRule],
  ['V16', 'apps/api', "import '../../../domains/iam-persistence/src/index.js';", importsRule],
  ['V17', 'packages/database', "import '@vertex-os/iam/persistence';", importsRule],
  ['V18', 'domains/iam', "process.env['X'];", syntaxRule, rawEnvironment],
  ['V19', 'domains/iam-persistence', "process.env['X'];", syntaxRule, rawEnvironment],
  // IAM depends on Audit, so Nx reports this reverse edge as a cycle before its tag (as V5/V7);
  // V23 exercises the domain:audit tag constraint directly.
  ['V20', 'domains/audit', "import '@vertex-os/iam';", nxRule, 'Circular dependency'],
  ['V21', 'domains/audit', "import '@vertex-os/database';", nxRule, 'layer:domain'],
  ['V22', 'domains/audit', "import '@prisma/client';", nxRule, '@prisma'],
  ['V23', 'domains/audit-persistence', "import '@vertex-os/iam';", nxRule, 'domain:audit'],
  // Observed as the layer:adapter tag rule (no cycle: audit-persistence has no path to it).
  [
    'V24',
    'domains/audit-persistence',
    "import '@vertex-os/iam-persistence';",
    nxRule,
    'layer:adapter',
  ],
  [
    'V25',
    'domains/iam-persistence',
    "import '@vertex-os/audit-persistence';",
    nxRule,
    'layer:adapter',
  ],
  ['V26', 'domains/iam', "import '@vertex-os/audit-persistence';", nxRule, 'layer:domain'],
  ['V27', 'domains/iam-persistence', "import '@vertex-os/database/audit';", importsRule],
  ['V28', 'domains/audit-persistence', "import '@vertex-os/database/iam';", importsRule],
  ['V29', 'apps/api', "import '@vertex-os/database/audit';", importsRule],
  ['V30', 'apps/api', "import '@vertex-os/audit/src/index.js';", importsRule],
  ['V31', 'apps/api', "await import('@vertex-os/database/iam');", syntaxRule, privateSubpath],
  [
    'V32',
    'apps/api',
    "type T = import('@vertex-os/iam/persistence').UserId;",
    syntaxRule,
    privateSubpath,
  ],
  ['V33', 'apps/api', 'await import(`@vertex-os/iam/persistence`);', syntaxRule, privateSubpath],
  ['V34', 'apps/api', "const s = 'x'; await import(s);", syntaxRule, computedImport],
  [
    'V35',
    'apps/api',
    "await import('@vertex-os/iam/persistence');",
    syntaxRule,
    privateSubpath,
    'src/main.ts',
  ],
  [
    'V36',
    'domains/iam-persistence',
    "declare const c: any; c.$executeRawUnsafe('x');",
    syntaxRule,
    unsafeRawSql,
  ],
  ['V37', 'packages/database', "import '@vertex-os/audit';", nxRule, 'layer:infrastructure'],
  ['V38', 'domains/audit', "process.env['X'];", syntaxRule, rawEnvironment],
  ['V39', 'domains/audit-persistence', "import '@prisma/client';", nxRule, '@prisma'],
  ['V40', 'apps/web', "import '@vertex-os/audit';", nxRule, 'scope:web'],
  // A2-02: interpolated template specifiers and createRequire.
  ['V41', 'apps/api', "await import(`${'@vertex-os'}/database/iam`);", syntaxRule, computedImport],
  ['V42', 'apps/api', "await import(`@vertex-${'os'}/database/iam`);", syntaxRule, computedImport],
  [
    'V43',
    'apps/api',
    "import { createRequire } from 'node:module';",
    importsRule,
    createRequireBan,
  ],
  ['V44', 'domains/iam', "import * as m from 'module';", importsRule, createRequireBan],
  // A2-03: bracket and destructured unsafe raw SQL.
  [
    'V45',
    'domains/iam-persistence',
    "declare const c: any; c['$queryRawUnsafe']('x');",
    syntaxRule,
    unsafeRawQuery,
  ],
  [
    'V46',
    'domains/iam-persistence',
    "declare const c: any; c['$executeRawUnsafe']('x');",
    syntaxRule,
    unsafeRawSql,
  ],
  [
    'V47',
    'domains/audit-persistence',
    'declare const c: any; const { $queryRawUnsafe } = c; void $queryRawUnsafe;',
    syntaxRule,
    unsafeRawQuery,
  ],
  // A-02: other routes to the raw environment in production source.
  [
    'V48',
    'domains/iam',
    "import { env } from 'node:process'; void env;",
    syntaxRule,
    rawEnvironment,
  ],
  ['V49', 'domains/iam', "globalThis.process.env['X'];", syntaxRule, rawEnvironment],
  ['V50', 'domains/iam', "globalThis['process']['env'];", syntaxRule, rawEnvironment],
  ['V51', 'apps/api', 'const { env } = process; void env;', syntaxRule, rawEnvironment],
  // The persistence adapters override no-restricted-imports; the createRequire ban must survive.
  [
    'V52',
    'domains/iam-persistence',
    "import { createRequire } from 'node:module';",
    importsRule,
    createRequireBan,
  ],
  [
    'V53',
    'domains/audit-persistence',
    "import { createRequire } from 'node:module';",
    importsRule,
    createRequireBan,
  ],
  // Every other route to createRequire.
  ['V54', 'apps/api', "import mod from 'node:module'; void mod;", importsRule, createRequireBan],
  ['V55', 'apps/api', "await import('node:module');", syntaxRule, createRequireBan],
  [
    'V56',
    'domains/iam',
    "process.getBuiltinModule('module').createRequire;",
    syntaxRule,
    createRequireBan,
  ],
  ['V57', 'apps/api', "import m = require('node:module'); void m;", syntaxRule, createRequireBan],
  [
    'V62',
    'packages/ui',
    "import { createRequire } from 'node:module';",
    importsRule,
    createRequireBan,
  ],
  // Template, re-export and nested-destructuring routes to the raw environment and unsafe SQL.
  ['V58', 'domains/iam', 'process[`env`];', syntaxRule, rawEnvironment],
  ['V59', 'domains/iam', "export * from 'node:process';", syntaxRule, rawEnvironment],
  [
    'V60',
    'domains/iam',
    'const { process: { env } } = globalThis; void env;',
    syntaxRule,
    rawEnvironment,
  ],
  [
    'V61',
    'domains/iam-persistence',
    'declare const c: any; c[`$queryRawUnsafe`](`x`);',
    syntaxRule,
    unsafeRawQuery,
  ],
  // IAM-R02: the identity-provider adapter and IAM's private entry for it.
  ['V63', 'domains/iam', "import '@vertex-os/iam-keycloak';", nxRule, 'Circular dependency'],
  ['V64', 'apps/api', "import '@vertex-os/iam/identity-provider';", importsRule],
  ['V65', 'domains/iam-persistence', "import '@vertex-os/iam/identity-provider';", importsRule],
  ['V66', 'domains/iam-keycloak', "import '@vertex-os/iam/persistence';", importsRule],
  ['V67', 'domains/iam-keycloak', "import '@vertex-os/database';", importsRule, 'Keycloak only'],
  ['V68', 'domains/iam-keycloak', "import '@nestjs/common';", nxRule, '@nestjs'],
  ['V69', 'domains/iam-keycloak', "import '@prisma/client';", nxRule, '@prisma'],
  ['V70', 'apps/api', "import '@vertex-os/iam-keycloak/src/index.js';", importsRule],
  ['V71', 'domains/iam-keycloak', "process.env['X'];", syntaxRule, rawEnvironment],
  [
    'V72',
    'domains/iam-keycloak',
    "import { createRequire } from 'node:module';",
    importsRule,
    createRequireBan,
  ],
  ['V73', 'domains/iam-persistence', "import '@vertex-os/iam-keycloak';", nxRule, 'layer:adapter'],
  ['V74', 'apps/web', "import '@vertex-os/iam-keycloak';", nxRule, 'scope:web'],
  // IAM-R03: the platform session entry stays inside the API's authentication area (D-01), and
  // the OIDC runtime libraries stay out of the domain core (A-04, D-19).
  ['V75', 'apps/api', "import '@vertex-os/database/auth';", importsRule],
  ['V76', 'apps/api', "import '@vertex-os/database/auth';", importsRule, undefined, 'src/iam/x.ts'],
  ['V77', 'domains/iam', "import '@vertex-os/database/auth';", importsRule],
  ['V78', 'domains/iam-persistence', "import '@vertex-os/database/auth';", importsRule],
  ['V79', 'domains/iam', "import 'openid-client';", nxRule, 'openid-client'],
  ['V80', 'domains/iam', "import 'jose';", nxRule, 'jose'],
  ['V81', 'domains/iam', "import 'oauth4webapi';", nxRule, 'oauth4webapi'],
  ['V82', 'apps/api', "await import('@vertex-os/database/auth');", syntaxRule, privateSubpath],
  // Review F1: inside the authentication area only its composition root imports adapters.
  [
    'V83',
    'apps/api',
    "import '@vertex-os/iam-persistence';",
    importsRule,
    'Only auth-runtime.ts',
    'src/auth/x.ts',
  ],
  [
    'V84',
    'apps/api',
    "import '@vertex-os/audit-persistence';",
    importsRule,
    'Only auth-runtime.ts',
    'src/auth/x.ts',
  ],
  // Review F2: subpath exports of the OIDC libraries are banned in the domain core too.
  ['V85', 'domains/iam', "import 'jose/jwt/verify';", nxRule, 'jose'],
  ['V86', 'domains/iam', "import 'openid-client/passport';", nxRule, 'openid-client'],
  ['V87', 'apps/web', "import 'openid-client';", nxRule, 'openid-client'],
];

const imports = (...specifiers) => specifiers.map((specifier) => `import '${specifier}';`);

// [id, project, code lines, virtual file relative to the project?]
const controls = [
  [
    'C1',
    'domains/iam-persistence',
    imports(
      '@vertex-os/iam',
      '@vertex-os/iam/persistence',
      '@vertex-os/database',
      '@vertex-os/database/iam',
      '@vertex-os/audit',
    ),
  ],
  [
    'C2',
    'apps/api',
    [
      ...imports(
        '@vertex-os/iam',
        '@vertex-os/iam-persistence',
        '@vertex-os/iam-keycloak',
        '@vertex-os/audit',
        '@vertex-os/audit-persistence',
        '@vertex-os/database',
      ),
      "await import('@vertex-os/iam');",
    ],
  ],
  [
    'C3',
    'domains/audit-persistence',
    imports('@vertex-os/audit', '@vertex-os/database', '@vertex-os/database/audit'),
  ],
  ['C4', 'domains/iam', imports('@vertex-os/audit')],
  ['C9', 'domains/iam-keycloak', imports('@vertex-os/iam', '@vertex-os/iam/identity-provider')],
  [
    'C10',
    'apps/api',
    imports('@vertex-os/database/auth', 'openid-client', 'jose'),
    'src/auth/__boundary_probe__.ts',
  ],
  [
    'C11',
    'apps/api',
    imports('@vertex-os/audit-persistence', '@vertex-os/database/auth'),
    'src/auth/auth-runtime.ts',
  ],
  ['C5', 'apps/api', ["process.env['DATABASE_URL'];"], 'src/commands/iam-sync-reference.ts'],
  // Tagged raw SQL and a literal, non-interpolated template import stay permitted.
  [
    'C6',
    'domains/iam-persistence',
    ['declare const c: any;', 'await c.$queryRaw`SELECT 1`;', 'await c.$executeRaw`SELECT 1`;'],
  ],
  ['C7', 'apps/api', ['await import(`node:path`);']],
  // The black-box end-to-end project resolves installed packages with createRequire.
  [
    'C8',
    'apps/web-e2e',
    ["import { createRequire } from 'node:module';", 'void createRequire;'],
    'src/visual/browser.setup.ts',
  ],
];

const linters = new Map();
async function lint(project, code, file = 'src/__boundary_probe__.ts') {
  const projectRoot = resolve(project);
  let linter = linters.get(projectRoot);
  if (!linter) {
    linter = new ESLint({ cwd: projectRoot });
    linters.set(projectRoot, linter);
  }
  const [result] = await linter.lintText(code, { filePath: resolve(projectRoot, file) });
  if (!result) throw new Error(`ESLint returned no result for ${project}`);
  return result.messages;
}

let failures = 0;
for (const [id, project, code, rule, fragment, file] of violations) {
  const messages = await lint(project, code, file);
  const passed = messages.some(
    (message) => message.ruleId === rule && (!fragment || message.message.includes(fragment)),
  );
  if (!passed) failures += 1;
  const observed = messages.find((message) => message.ruleId === rule)?.message ?? '';
  console.log(
    `${id} ${passed ? 'PASS' : 'FAIL'} ${rule}${fragment ? ` (${fragment})` : ` — ${observed}`}`,
  );
  if (!passed)
    console.error(messages.map((message) => `${message.ruleId}: ${message.message}`).join('\n'));
}

for (const [id, project, lines, file] of controls) {
  const messages = await lint(project, lines.join('\n'), file);
  const boundaryMessages = messages.filter((message) => boundaryRules.has(message.ruleId));
  const passed = boundaryMessages.length === 0;
  if (!passed) failures += 1;
  console.log(`${id} ${passed ? 'PASS' : 'FAIL'} positive control`);
  if (!passed)
    console.error(
      boundaryMessages.map((message) => `${message.ruleId}: ${message.message}`).join('\n'),
    );
}

if (failures) {
  console.error(`${failures} boundary case(s) failed`);
  process.exitCode = 1;
}

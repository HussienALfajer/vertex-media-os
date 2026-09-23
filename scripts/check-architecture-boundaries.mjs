import { createProjectGraphAsync } from '@nx/devkit';
import { ESLint } from 'eslint';
import { resolve } from 'node:path';

// Build the graph before ESLint loads the Nx boundary rule, including on a fresh clone.
await createProjectGraphAsync();

const nxRule = '@nx/enforce-module-boundaries';
const importsRule = 'no-restricted-imports';
const envRule = 'no-restricted-syntax';
const boundaryRules = new Set([nxRule, importsRule, envRule]);

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
  ['V14', 'apps/api', "import '@vertex-os/database/persistence';", importsRule],
  ['V15', 'apps/api', "import '@vertex-os/iam-persistence/src/index.js';", importsRule],
  ['V16', 'apps/api', "import '../../../domains/iam-persistence/src/index.js';", importsRule],
  ['V17', 'packages/database', "import '@vertex-os/iam/persistence';", importsRule],
  ['V18', 'domains/iam', "process.env['X'];", envRule],
  ['V19', 'domains/iam-persistence', "process.env['X'];", envRule],
];

const controls = [
  [
    'C1',
    'domains/iam-persistence',
    [
      '@vertex-os/iam',
      '@vertex-os/iam/persistence',
      '@vertex-os/database',
      '@vertex-os/database/persistence',
    ],
  ],
  ['C2', 'apps/api', ['@vertex-os/iam', '@vertex-os/iam-persistence', '@vertex-os/database']],
];

const linters = new Map();
async function lint(project, code) {
  const projectRoot = resolve(project);
  let linter = linters.get(projectRoot);
  if (!linter) {
    linter = new ESLint({ cwd: projectRoot });
    linters.set(projectRoot, linter);
  }
  const [result] = await linter.lintText(code, {
    filePath: resolve(projectRoot, 'src', '__boundary_probe__.ts'),
  });
  if (!result) throw new Error(`ESLint returned no result for ${project}`);
  return result.messages;
}

let failures = 0;
for (const [id, project, code, rule, fragment] of violations) {
  const messages = await lint(project, code);
  const passed = messages.some(
    (message) => message.ruleId === rule && (!fragment || message.message.includes(fragment)),
  );
  if (!passed) failures += 1;
  console.log(`${id} ${passed ? 'PASS' : 'FAIL'} ${rule}${fragment ? ` (${fragment})` : ''}`);
  if (!passed)
    console.error(messages.map((message) => `${message.ruleId}: ${message.message}`).join('\n'));
}

for (const [id, project, imports] of controls) {
  const messages = await lint(
    project,
    imports.map((specifier) => `import '${specifier}';`).join('\n'),
  );
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

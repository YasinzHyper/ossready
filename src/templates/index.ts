export type { ScaffoldOptions } from "./types.js";
export { licenseText } from "./license.js";
export { readmeText } from "./readme.js";
export { ciWorkflowText, releaseWorkflowText } from "./ci.js";
export {
  bugReportTemplate,
  featureRequestTemplate,
  pullRequestTemplate,
  codeownersText,
  dependabotYmlText,
} from "./github.js";
export { securityMdText } from "./security.js";
export { codeOfConductText } from "./coc.js";
export { contributingText } from "./contributing.js";
export {
  gitignoreText,
  changelogText,
  packageJsonText,
  tsconfigText,
  srcIndexText,
} from "./package.js";

import type { ScaffoldOptions } from "./types.js";
import { licenseText } from "./license.js";
import { readmeText } from "./readme.js";
import { ciWorkflowText, releaseWorkflowText } from "./ci.js";
import {
  bugReportTemplate,
  featureRequestTemplate,
  pullRequestTemplate,
  codeownersText,
  dependabotYmlText,
} from "./github.js";
import { securityMdText } from "./security.js";
import { codeOfConductText } from "./coc.js";
import { contributingText } from "./contributing.js";
import {
  gitignoreText,
  changelogText,
  packageJsonText,
  tsconfigText,
  srcIndexText,
} from "./package.js";

export type ScaffoldFile = { path: string; content: string };

export function buildScaffoldFiles(opts: ScaffoldOptions): ScaffoldFile[] {
  return [
    { path: "LICENSE", content: licenseText(opts) },
    { path: "README.md", content: readmeText(opts) },
    { path: "SECURITY.md", content: securityMdText(opts) },
    { path: "CODE_OF_CONDUCT.md", content: codeOfConductText(opts) },
    { path: ".gitignore", content: gitignoreText() },
    { path: ".github/workflows/ci.yml", content: ciWorkflowText(opts) },
    { path: ".github/workflows/release.yml", content: releaseWorkflowText() },
    {
      path: ".github/ISSUE_TEMPLATE/bug_report.md",
      content: bugReportTemplate(),
    },
    {
      path: ".github/ISSUE_TEMPLATE/feature_request.md",
      content: featureRequestTemplate(),
    },
    {
      path: ".github/PULL_REQUEST_TEMPLATE.md",
      content: pullRequestTemplate(),
    },
    { path: ".github/CODEOWNERS", content: codeownersText() },
    { path: ".github/dependabot.yml", content: dependabotYmlText() },
    { path: "CONTRIBUTING.md", content: contributingText(opts) },
    { path: "CHANGELOG.md", content: changelogText(opts) },
    { path: "package.json", content: packageJsonText(opts) },
    { path: "tsconfig.json", content: tsconfigText() },
    { path: "src/index.ts", content: srcIndexText(opts) },
  ];
}

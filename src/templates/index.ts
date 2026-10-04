export type { ScaffoldOptions } from "./types.js";
export { licenseText } from "./license.js";
export { readmeText } from "./readme.js";
export { ciWorkflowText, releaseWorkflowText, publishWorkflowText } from "./ci.js";
export { fundingYmlText } from "./funding.js";
export { citationCffText } from "./citation.js";
export { supportMdText } from "./support.js";
export {
  bugReportTemplate,
  featureRequestTemplate,
  issueTemplateConfigText,
  pullRequestTemplate,
  codeownersText,
  dependabotYmlText,
  editorconfigText,
  codeqlWorkflowText,
  dependencyReviewWorkflowText,
  scorecardWorkflowText,
  staleWorkflowText,
  lockWorkflowText,
} from "./github.js";
export { securityMdText } from "./security.js";
export { codeOfConductText } from "./coc.js";
export { contributingText } from "./contributing.js";
export {
  gitignoreText,
  nvmrcText,
  prettierRcText,
  prettierIgnoreText,
  eslintConfigText,
  changelogText,
  packageJsonText,
  tsconfigText,
  srcIndexText,
  vitestConfigText,
  srcTestText,
} from "./package.js";

import type { ScaffoldOptions } from "./types.js";
import { licenseText } from "./license.js";
import { readmeText } from "./readme.js";
import { ciWorkflowText, releaseWorkflowText, publishWorkflowText } from "./ci.js";
import { fundingYmlText } from "./funding.js";
import { citationCffText } from "./citation.js";
import { supportMdText } from "./support.js";
import {
  bugReportTemplate,
  featureRequestTemplate,
  issueTemplateConfigText,
  pullRequestTemplate,
  codeownersText,
  dependabotYmlText,
  editorconfigText,
  codeqlWorkflowText,
  dependencyReviewWorkflowText,
  scorecardWorkflowText,
  staleWorkflowText,
  lockWorkflowText,
} from "./github.js";
import { securityMdText } from "./security.js";
import { codeOfConductText } from "./coc.js";
import { contributingText } from "./contributing.js";
import {
  gitignoreText,
  nvmrcText,
  prettierRcText,
  prettierIgnoreText,
  eslintConfigText,
  changelogText,
  packageJsonText,
  tsconfigText,
  srcIndexText,
  vitestConfigText,
  srcTestText,
} from "./package.js";

export type ScaffoldFile = { path: string; content: string };

export function buildScaffoldFiles(opts: ScaffoldOptions): ScaffoldFile[] {
  return [
    { path: "LICENSE", content: licenseText(opts) },
    { path: "README.md", content: readmeText(opts) },
    { path: "SECURITY.md", content: securityMdText(opts) },
    { path: "SUPPORT.md", content: supportMdText(opts) },
    { path: "CODE_OF_CONDUCT.md", content: codeOfConductText(opts) },
    { path: ".gitignore", content: gitignoreText() },
    { path: ".nvmrc", content: nvmrcText() },
    { path: ".editorconfig", content: editorconfigText() },
    { path: ".prettierrc", content: prettierRcText() },
    { path: ".prettierignore", content: prettierIgnoreText() },
    { path: "eslint.config.js", content: eslintConfigText() },
    { path: ".github/workflows/ci.yml", content: ciWorkflowText(opts) },
    { path: ".github/workflows/release.yml", content: releaseWorkflowText() },
    { path: ".github/workflows/publish.yml", content: publishWorkflowText() },
    { path: ".github/workflows/codeql.yml", content: codeqlWorkflowText() },
    {
      path: ".github/workflows/dependency-review.yml",
      content: dependencyReviewWorkflowText(),
    },
    {
      path: ".github/workflows/scorecard.yml",
      content: scorecardWorkflowText(),
    },
    {
      path: ".github/workflows/stale.yml",
      content: staleWorkflowText(),
    },
    {
      path: ".github/workflows/lock.yml",
      content: lockWorkflowText(),
    },
    {
      path: ".github/ISSUE_TEMPLATE/bug_report.yml",
      content: bugReportTemplate(),
    },
    {
      path: ".github/ISSUE_TEMPLATE/feature_request.yml",
      content: featureRequestTemplate(),
    },
    {
      path: ".github/ISSUE_TEMPLATE/config.yml",
      content: issueTemplateConfigText(opts),
    },
    {
      path: ".github/PULL_REQUEST_TEMPLATE.md",
      content: pullRequestTemplate(),
    },
    { path: ".github/CODEOWNERS", content: codeownersText(opts) },
    { path: ".github/dependabot.yml", content: dependabotYmlText() },
    { path: ".github/FUNDING.yml", content: fundingYmlText(opts) },
    {
      path: "CITATION.cff",
      content: citationCffText({
        name: opts.name,
        license: opts.license,
        githubOwner: opts.githubOwner,
        author: opts.author,
      }),
    },
    { path: "CONTRIBUTING.md", content: contributingText(opts) },
    { path: "CHANGELOG.md", content: changelogText(opts) },
    { path: "package.json", content: packageJsonText(opts) },
    { path: "tsconfig.json", content: tsconfigText() },
    { path: "vitest.config.ts", content: vitestConfigText() },
    { path: "src/index.ts", content: srcIndexText(opts) },
    { path: "src/index.test.ts", content: srcTestText(opts) },
  ];
}

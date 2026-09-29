import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";
import {
  bugReportTemplate,
  featureRequestTemplate,
  issueTemplateConfigText,
} from "../src/templates/github.js";

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init GitHub Issue Forms scaffold", () => {
  it("exposes idiomatic YAML Issue Form templates", () => {
    const bug = bugReportTemplate();
    expect(bug).toContain("name: Bug report");
    expect(bug).toContain("description: Report a problem so we can fix it");
    expect(bug).toContain('labels: ["bug"]');
    expect(bug).toContain("body:");
    expect(bug).toContain("id: description");
    expect(bug).toContain("id: reproduce");
    expect(bug).toContain("id: expected");
    expect(bug).toContain("id: actual");
    expect(bug).toContain("id: environment");
    expect(bug).toContain("type: textarea");
    expect(bug).toContain("required: true");
    expect(bug).not.toContain("about:");

    const feat = featureRequestTemplate();
    expect(feat).toContain("name: Feature request");
    expect(feat).toContain("description: Suggest an idea for this project");
    expect(feat).toContain('labels: ["enhancement"]');
    expect(feat).toContain("id: problem");
    expect(feat).toContain("id: solution");
    expect(feat).toContain("id: alternatives");
    expect(feat).not.toContain("about:");

    const config = issueTemplateConfigText({
      name: "demo-lib",
      githubOwner: "AcmeOrg",
    });
    expect(config).toContain("blank_issues_enabled: false");
    expect(config).toContain("contact_links:");
    expect(config).toContain(
      "https://github.com/AcmeOrg/demo-lib/security/advisories/new",
    );

    const placeholder = issueTemplateConfigText({ name: "demo-lib" });
    expect(placeholder).toContain(
      "https://github.com/OWNER/demo-lib/security/advisories/new",
    );
  });

  it("writes Issue Forms + config.yml into new projects", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "forms-app",
      description: "Issue Forms demo",
      license: "mit",
      packageManager: "npm",
      githubOwner: "YasinzHyper",
    });

    const bug = await readFile(
      join(dir, ".github/ISSUE_TEMPLATE/bug_report.yml"),
      "utf8",
    );
    expect(bug).toContain("name: Bug report");
    expect(bug).toContain("id: reproduce");
    expect(bug).toContain("id: environment");

    const feat = await readFile(
      join(dir, ".github/ISSUE_TEMPLATE/feature_request.yml"),
      "utf8",
    );
    expect(feat).toContain("name: Feature request");
    expect(feat).toContain("id: problem");
    expect(feat).toContain("id: solution");

    const config = await readFile(
      join(dir, ".github/ISSUE_TEMPLATE/config.yml"),
      "utf8",
    );
    expect(config).toContain("blank_issues_enabled: false");
    expect(config).toContain(
      "https://github.com/YasinzHyper/forms-app/security/advisories/new",
    );

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("GitHub Issue Forms");
  });
});

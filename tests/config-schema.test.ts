import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  OSSREADY_RC_DOCTOR_KEYS,
  OSSREADY_RC_ROOT_KEYS,
  OSSREADY_RC_SCHEMA_PATH,
  OSSREADY_RC_SCHEMA_URL,
  parseOssreadyConfig,
} from "../src/config.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type JsonSchema = {
  $schema?: string;
  $id?: string;
  type?: string;
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchema & { $ref?: string }>;
  $defs?: Record<string, JsonSchema & { oneOf?: JsonSchema[] }>;
  examples?: unknown[];
};

/**
 * Tiny subset validator for the shipped ossreadyrc schema: object roots,
 * `additionalProperties: false`, `$ref` to `#/$defs/idList`, and that def's
 * string | string[] oneOf. Enough to prove the file matches the loader without
 * pulling in a JSON Schema library.
 */
function validateAgainstOssreadySchema(value: unknown, schema: JsonSchema): string[] {
  const errors: string[] = [];
  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return ["expected a JSON object"];
    }
    const obj = value as Record<string, unknown>;
    const props = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) errors.push(`unknown key ${key}`);
      }
    }
    for (const [key, propSchema] of Object.entries(props)) {
      if (!(key in obj)) continue;
      const child = obj[key];
      if (propSchema.$ref === "#/$defs/idList") {
        errors.push(...validateIdList(child, key));
      } else if (propSchema.type === "string") {
        if (typeof child !== "string") errors.push(`${key}: expected string`);
      } else if (propSchema.type === "object") {
        errors.push(...validateAgainstOssreadySchema(child, propSchema).map((e) => `${key}.${e}`));
      }
    }
  }
  return errors;
}

function validateIdList(value: unknown, field: string): string[] {
  if (typeof value === "string") return value.length > 0 ? [] : [`${field}: empty string`];
  if (Array.isArray(value)) {
    if (!value.every((v) => typeof v === "string" && v.length > 0)) {
      return [`${field}: expected an array of non-empty strings`];
    }
    return [];
  }
  return [`${field}: expected a string or an array of strings`];
}

const VALID: unknown[] = [
  {},
  { $schema: OSSREADY_RC_SCHEMA_URL },
  { skip: ["funding", "citation"] },
  { check: "readme,license", skip: "funding" },
  { check: ["readme"], skip: ["funding"] },
  { doctor: { skip: ["funding"] } },
  { doctor: { check: ["readme"], skip: "citation" }, skip: ["funding"] },
  {
    $schema: OSSREADY_RC_SCHEMA_URL,
    doctor: { check: "readme", skip: ["funding", "citation"] },
  },
];

const INVALID: Array<{ raw: unknown; message: RegExp }> = [
  { raw: [], message: /expected a JSON object/ },
  { raw: "nope", message: /expected a JSON object/ },
  { raw: { skip: 1 }, message: /Invalid "skip"/ },
  { raw: { check: [1] }, message: /Invalid "check"/ },
  { raw: { doctor: "nope" }, message: /Invalid "doctor"/ },
  { raw: { skipp: ["funding"] }, message: /Unknown config key `skipp`.*Did you mean `skip`/ },
  { raw: { doctor: { chek: ["readme"] } }, message: /Unknown "doctor" key `chek`.*Did you mean `check`/ },
  { raw: { unrelated: true }, message: /Unknown config key `unrelated`/ },
];

describe("schema/ossreadyrc.schema.json", () => {
  it("is valid JSON and stays in sync with the config loader keys", async () => {
    const text = await readFile(join(repoRoot, OSSREADY_RC_SCHEMA_PATH), "utf8");
    const schema = JSON.parse(text) as JsonSchema;
    expect(schema.$schema).toMatch(/json-schema\.org/);
    expect(schema.$id).toContain("ossreadyrc.schema.json");
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual([...OSSREADY_RC_ROOT_KEYS].sort());
    expect(schema.properties?.doctor?.type).toBe("object");
    expect(schema.properties?.doctor?.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties?.doctor?.properties ?? {}).sort()).toEqual(
      [...OSSREADY_RC_DOCTOR_KEYS].sort(),
    );
    expect(schema.$defs?.idList?.oneOf?.some((o) => o.type === "string")).toBe(true);
    expect(schema.$defs?.idList?.oneOf?.some((o) => o.type === "array")).toBe(true);
    expect(schema.examples?.length).toBeGreaterThan(0);
    expect(OSSREADY_RC_SCHEMA_URL).toContain(OSSREADY_RC_SCHEMA_PATH);
  });

  it("accepts every loader-valid fixture and rejects loader-invalid ones", async () => {
    const schema = JSON.parse(
      await readFile(join(repoRoot, OSSREADY_RC_SCHEMA_PATH), "utf8"),
    ) as JsonSchema;

    for (const raw of VALID) {
      expect(() => parseOssreadyConfig(raw, "t"), JSON.stringify(raw)).not.toThrow();
      expect(validateAgainstOssreadySchema(raw, schema), JSON.stringify(raw)).toEqual([]);
    }

    for (const { raw, message } of INVALID) {
      expect(() => parseOssreadyConfig(raw, "t"), JSON.stringify(raw)).toThrow(message);
      // Structural / type failures the schema covers should also fail the subset validator
      // (unknown keys and wrong list types). Non-object roots fail both.
      if (raw !== null && typeof raw === "object") {
        const schemaErrors = validateAgainstOssreadySchema(raw, schema);
        expect(schemaErrors.length, JSON.stringify(raw)).toBeGreaterThan(0);
      }
    }
  });

  it("documents the GitHub raw $schema URL in its examples", async () => {
    const schema = JSON.parse(
      await readFile(join(repoRoot, OSSREADY_RC_SCHEMA_PATH), "utf8"),
    ) as JsonSchema;
    const withSchema = (schema.examples ?? []).find(
      (ex) => isPlain(ex) && typeof ex.$schema === "string",
    ) as { $schema: string } | undefined;
    expect(withSchema?.$schema).toBe(OSSREADY_RC_SCHEMA_URL);
  });
});

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

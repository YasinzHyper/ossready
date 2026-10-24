#!/usr/bin/env node
import { runCli } from "./program.js";

// Commands, options and error handling live in src/program.ts so tests can run
// the CLI in-process; runCli never throws and sets process.exitCode.
void runCli(process.argv);

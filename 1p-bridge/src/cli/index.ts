#!/usr/bin/env node
import { Command } from "commander";
import { runGet } from "./get.js";
import { runList } from "./list.js";
import { runOtp } from "./otp.js";

const program = new Command();
const actor = process.env.USER ?? "unknown";

program
  .name("chitty-op")
  .description("Operator-grade 1Password access via the chitty-1p-bridge")
  .version("0.1.0");

program
  .command("get <path>")
  .description("Read a credential field. path = vault/item or vault/item/field")
  .action(async (path: string) => {
    process.exit(await runGet(path, { actor }));
  });

program
  .command("list [vault]")
  .description("List vaults (no arg) or items in a vault")
  .action(async (vault?: string) => {
    process.exit(await runList(vault, { actor }));
  });

program
  .command("otp <path>")
  .description("Print current TOTP code. path = vault/item")
  .action(async (path: string) => {
    process.exit(await runOtp(path, { actor }));
  });

await program.parseAsync(process.argv);

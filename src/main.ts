import { runHookCommand } from "./commands/hook.js";
import { install } from "./commands/install.js";
import { save } from "./commands/save.js";
import { status } from "./commands/status.js";
import { uninstall } from "./commands/uninstall.js";

async function main(): Promise<void> {
    const [cmd, ...rest] = process.argv.slice(2);
    switch (cmd) {
        case "hook":
            return runHookCommand(rest);
        case "install":
            return install(rest);
        case "uninstall":
            return uninstall();
        case "status":
            return status();
        case "save":
            return save(rest);
        default:
            process.stdout.write(
                "usage: npx @crosmos/codex <install | uninstall | status | save>\n"
            );
    }
}

main();

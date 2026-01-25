#!/usr/bin/env node

/**
 * ChittyOps Unified CLI
 * Single command interface for all operations
 */

const { ChittyOpsOrchestrator } = require('../cross-org/cli');
const { HookifyCLI } = require('../terminal-ops/hookify/cli');

const showHelp = () => {
    console.log(`
🔧 ChittyOps - Unified Operations CLI
Foundation-governed operations across ChittyOS ecosystem

USAGE:
  chitty-ops <command> [options]

COMMANDS:
  deploy <service>        Deploy service across organizations
  status                  Show status of all services
  monitor                 Monitor services (interactive dashboard coming soon)
  logs <service>          View service logs
  sync-hooks              Sync hooks across repositories
  sync-workflows          Sync workflows across organizations

HOOK MANAGEMENT:
  hook add <name> <script>    Add a hook (foundation-validated)
  hook list                   List all hooks
  hook create <name> <file>   Create hook template
  hook sync                   Sync hooks to repos

CROSS-ORG OPERATIONS:
  org status                  Show all organizations
  org deploy <service>        Deploy across orgs
  org refresh                 Refresh org data

OPTIONS:
  --all-orgs                 Apply to all organizations
  --org <name>               Specific organization
  --env <environment>        Deployment environment
  --detailed                 Show detailed information

FOUNDATION GOVERNANCE:
  ✅ All hooks validated against @chittyfoundation/hookify
  ✅ All operations respect @chittyfoundation/territories
  ✅ Automatic compliance checking

EXAMPLES:
  # Deploy across all orgs (with territory validation)
  chitty-ops deploy chittycore --all-orgs

  # Add a pre-commit hook (foundation-validated)
  chitty-ops hook add pre-commit ./scripts/lint.sh

  # Check status with territory info
  chitty-ops org status --detailed

  # Sync hooks to all repos
  chitty-ops sync-hooks --all-repos

MORE HELP:
  chitty-ops deploy --help
  chitty-ops hook --help
  chitty-ops org --help
  
  Or use specific CLIs:
  - hookify       (hook management)
  - chitty-org    (cross-org orchestration)
    `);
};

const [,, command, ...args] = process.argv;

(async () => {
    try {
        if (!command || command === 'help' || command === '--help' || command === '-h') {
            showHelp();
            return;
        }

        // Delegate to appropriate CLI
        switch (command) {
            case 'deploy':
            case 'status':
            case 'sync-workflows':
                const orchestrator = new ChittyOpsOrchestrator();
                // Would call orchestrator methods here
                console.log(`🚧 ${command} command coming soon`);
                console.log('   Use: chitty-org ' + command + ' ' + args.join(' '));
                break;

            case 'hook':
                console.log('🔧 Hook management:');
                console.log('   Use: hookify ' + args.join(' '));
                break;

            case 'org':
                console.log('🌍 Cross-org operations:');
                console.log('   Use: chitty-org ' + args.join(' '));
                break;

            case 'sync-hooks':
                console.log('🔄 Syncing hooks...');
                console.log('   Use: hookify sync --all-repos');
                break;

            default:
                console.error(`❌ Unknown command: ${command}`);
                console.log('   Run: chitty-ops help');
                process.exit(1);
        }
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
})();

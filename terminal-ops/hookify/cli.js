#!/usr/bin/env node

/**
 * Hookify CLI - ChittyOS Implementation
 * Wraps hook manager and validates against foundation contracts
 */

const { ChittyOpsHookManager } = require('../hooks/hook-manager');
const fs = require('fs');
const path = require('path');

class HookifyCLI {
    constructor() {
        this.manager = new ChittyOpsHookManager();
        this.templates = this.loadTemplates();
    }

    loadTemplates() {
        return {
            'pre-commit': {
                description: 'Runs before git commit',
                type: 'git',
                territory: 'operations'
            },
            'pre-push': {
                description: 'Runs before git push',
                type: 'git',
                territory: 'operations'
            },
            'post-merge': {
                description: 'Runs after git merge',
                type: 'git',
                territory: 'operations'
            },
            'commit-msg': {
                description: 'Validates commit messages',
                type: 'git',
                territory: 'operations'
            },
            'session-start': {
                description: 'Runs when terminal session starts',
                type: 'terminal',
                territory: 'operations'
            },
            'cd-change': {
                description: 'Runs when changing directories',
                type: 'terminal',
                territory: 'operations'
            },
            'pre-deploy': {
                description: 'Runs before deployment',
                type: 'custom',
                territory: 'operations'
            },
            'post-deploy': {
                description: 'Runs after deployment',
                type: 'custom',
                territory: 'operations'
            }
        };
    }

    async add(hookName, scriptPath, options = {}) {
        const template = this.templates[hookName];
        
        if (!template) {
            console.error(`❌ Unknown hook: ${hookName}`);
            console.log('\n📋 Available hooks:');
            this.listTemplates();
            return false;
        }

        if (!fs.existsSync(scriptPath)) {
            console.error(`❌ Script not found: ${scriptPath}`);
            return false;
        }

        // Make script executable
        fs.chmodSync(scriptPath, 0o755);

        try {
            const hook = this.manager.register(
                template.type,
                hookName,
                scriptPath,
                {
                    ...options,
                    territory: options.territory || template.territory
                }
            );

            console.log(`✅ Added ${hookName} hook: ${scriptPath}`);
            console.log(`   Type: ${template.type}`);
            console.log(`   Territory: ${hook.governance.territory}`);
            console.log(`   Validated: Foundation contract v${hook.contract}`);

            // Sync to repos if specified
            if (options.allRepos) {
                await this.syncAllRepos();
            } else if (template.type === 'git') {
                const cwd = process.cwd();
                if (fs.existsSync(path.join(cwd, '.git'))) {
                    this.manager.syncToRepo(cwd);
                }
            }

            return true;
        } catch (error) {
            console.error(`❌ Failed to add hook: ${error.message}`);
            console.log('   This may be due to foundation governance policy violations.');
            return false;
        }
    }

    listTemplates() {
        Object.entries(this.templates).forEach(([name, template]) => {
            console.log(`  ${name.padEnd(20)} - ${template.description}`);
            console.log(`  ${' '.repeat(20)}   Territory: ${template.territory}`);
        });
    }

    list() {
        const hooks = this.manager.list();
        
        console.log('\n📋 Registered Hooks (Foundation Validated):\n');
        
        if (hooks.length === 0) {
            console.log('  No hooks registered yet.');
            console.log('\n  Try: hookify add pre-commit ./scripts/lint.sh');
            return;
        }

        hooks.forEach(hook => {
            const compliant = hook.foundationCompliant ? '✅' : '⚠️';
            const enabled = hook.enabled !== false ? '✓' : '✗';
            console.log(`  ${compliant} ${enabled} ${hook.hookId}`);
            console.log(`     Script: ${hook.script}`);
            console.log(`     Territory: ${hook.governance.territory || 'none'}`);
            console.log(`     Priority: ${hook.governance.priority}`);
            
            if (!hook.foundationCompliant && hook.complianceIssues.length > 0) {
                console.log(`     ⚠️  Compliance Issues:`);
                hook.complianceIssues.forEach(issue => {
                    console.log(`        - ${issue}`);
                });
            }
        });

        console.log('\n💡 All hooks are validated against @chittyfoundation/hookify contracts');
    }

    async syncAllRepos() {
        console.log('🔄 Syncing hooks to all repositories...');
        
        const searchPaths = [
            path.join(process.env.HOME, 'github.com'),
            path.join(process.env.HOME, 'projects')
        ];

        let syncCount = 0;
        for (const searchPath of searchPaths) {
            if (fs.existsSync(searchPath)) {
                const repos = this.findGitRepos(searchPath, 3);
                repos.forEach(repo => {
                    if (this.manager.syncToRepo(repo)) {
                        syncCount++;
                    }
                });
            }
        }

        console.log(`✅ Synced foundation-compliant hooks to ${syncCount} repositories`);
    }

    findGitRepos(dir, depth = 3) {
        if (depth === 0) return [];
        
        const repos = [];
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                
                const fullPath = path.join(dir, entry.name);
                
                if (entry.name === '.git') {
                    repos.push(path.dirname(fullPath));
                } else if (!entry.name.startsWith('.')) {
                    repos.push(...this.findGitRepos(fullPath, depth - 1));
                }
            }
        } catch (error) {
            // Skip directories we can't read
        }

        return repos;
    }

    create(hookName, outputPath) {
        const template = this.templates[hookName];
        
        if (!template) {
            console.error(`❌ Unknown hook: ${hookName}`);
            return false;
        }

        const scriptContent = this.generateTemplate(hookName, template);
        fs.writeFileSync(outputPath, scriptContent, { mode: 0o755 });

        console.log(`✅ Created ${hookName} template: ${outputPath}`);
        console.log(`   Territory: ${template.territory}`);
        console.log('   Edit the script and then run:');
        console.log(`   hookify add ${hookName} ${outputPath}`);
    }

    generateTemplate(hookName, template) {
        return `#!/bin/bash
# ChittyOps Hook: ${hookName}
# ${template.description}
# Territory: ${template.territory}
# Governed by: @chittyfoundation/hookify
#
# This hook will be validated against foundation contracts when registered.

set -e

echo "🔧 Running ${hookName} hook..."

# Your custom logic here
# Example:
# npm test
# npm run lint
# ./scripts/your-script.sh

echo "✅ ${hookName} hook complete"

exit 0
`;
    }
}

// CLI execution
if (require.main === module) {
    const cli = new HookifyCLI();
    const [,, command, ...args] = process.argv;

    const parseOptions = (args) => {
        const options = {};
        const positional = [];

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            
            if (arg === '--all-repos') {
                options.allRepos = true;
            } else if (arg === '--blocking') {
                options.blocking = true;
            } else if (arg === '--non-blocking') {
                options.blocking = false;
            } else if (arg === '--scope') {
                options.scope = args[++i];
            } else if (arg === '--territory') {
                options.territory = args[++i];
            } else if (arg === '--priority') {
                options.priority = parseInt(args[++i]);
            } else if (!arg.startsWith('--')) {
                positional.push(arg);
            }
        }

        return { options, positional };
    };

    const showHelp = () => {
        console.log(`
Hookify CLI - ChittyOS Implementation
Validates hooks against @chittyfoundation/hookify contracts

USAGE:
  hookify <command> [options]

COMMANDS:
  add <hook-name> <script-path>     Add a hook (validates against foundation)
  list                              List all hooks with compliance status
  create <hook-name> <output-path>  Create a template hook script
  sync [repo-path]                  Sync hooks to repository
  sync --all-repos                  Sync hooks to all repositories

OPTIONS:
  --all-repos                       Apply to all repositories
  --blocking                        Make hook blocking
  --non-blocking                    Make hook non-blocking
  --scope <scope>                   Set scope (global, org, repo)
  --territory <territory>           Set territory (identity, registry, operations, etc)
  --priority <number>               Set priority (0-100)

EXAMPLES:
  # Add pre-commit hook (auto-validates against foundation)
  hookify add pre-commit ./scripts/lint.sh

  # Add with custom territory
  hookify add pre-deploy ./scripts/check.sh --territory operations

  # Create template
  hookify create pre-commit ./hooks/my-hook.sh

  # List all hooks with foundation compliance
  hookify list

FOUNDATION VALIDATION:
  All hooks are automatically validated against:
  - @chittyfoundation/hookify contracts
  - Territory permissions
  - Governance policies
        `);
    };

    (async () => {
        try {
            switch (command) {
                case 'add': {
                    const { options, positional } = parseOptions(args);
                    const [hookName, scriptPath] = positional;
                    
                    if (!hookName || !scriptPath) {
                        console.error('❌ Usage: hookify add <hook-name> <script-path>');
                        process.exit(1);
                    }
                    
                    await cli.add(hookName, scriptPath, options);
                    break;
                }

                case 'list': {
                    cli.list();
                    break;
                }

                case 'create': {
                    const { positional } = parseOptions(args);
                    const [hookName, outputPath] = positional;
                    
                    if (!hookName || !outputPath) {
                        console.error('❌ Usage: hookify create <hook-name> <output-path>');
                        process.exit(1);
                    }
                    
                    cli.create(hookName, outputPath);
                    break;
                }

                case 'sync': {
                    const { options, positional } = parseOptions(args);
                    
                    if (options.allRepos) {
                        await cli.syncAllRepos();
                    } else {
                        const repo = positional[0] || process.cwd();
                        cli.manager.syncToRepo(repo);
                        console.log(`✅ Synced foundation-compliant hooks to ${repo}`);
                    }
                    break;
                }

                case 'help':
                case '--help':
                case '-h':
                    showHelp();
                    break;

                default:
                    console.error(`❌ Unknown command: ${command || '(none)'}`);
                    showHelp();
                    process.exit(1);
            }
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = { HookifyCLI };

#!/usr/bin/env node

/**
 * ChittyOps Hookify CLI
 * Convert any script into a managed hook
 */

const fs = require('fs');
const path = require('path');
const { HookManager } = require('../hooks/framework/hook-manager.js');

class HookifyCLI {
    constructor() {
        this.manager = new HookManager();
        this.templates = this.loadTemplates();
    }

    loadTemplates() {
        return {
            'pre-commit': {
                description: 'Runs before git commit',
                type: 'git',
                blocking: true
            },
            'pre-push': {
                description: 'Runs before git push',
                type: 'git',
                blocking: true
            },
            'post-merge': {
                description: 'Runs after git merge',
                type: 'git',
                blocking: false
            },
            'commit-msg': {
                description: 'Validates commit messages',
                type: 'git',
                blocking: true
            },
            'session-start': {
                description: 'Runs when terminal session starts',
                type: 'terminal',
                blocking: false
            },
            'session-end': {
                description: 'Runs when terminal session ends',
                type: 'terminal',
                blocking: false
            },
            'cd-change': {
                description: 'Runs when changing directories',
                type: 'terminal',
                blocking: false
            },
            'pre-deploy': {
                description: 'Runs before deployment',
                type: 'custom',
                blocking: true
            },
            'post-deploy': {
                description: 'Runs after deployment',
                type: 'custom',
                blocking: false
            },
            'pre-test': {
                description: 'Runs before tests',
                type: 'custom',
                blocking: true
            },
            'post-test': {
                description: 'Runs after tests',
                type: 'custom',
                blocking: false
            }
        };
    }

    async add(hookName, scriptPath, options = {}) {
        const template = this.templates[hookName];
        
        if (!template) {
            console.error(`❌ Unknown hook: ${hookName}`);
            console.log('\nAvailable hooks:');
            this.list();
            return false;
        }

        if (!fs.existsSync(scriptPath)) {
            console.error(`❌ Script not found: ${scriptPath}`);
            return false;
        }

        // Make script executable
        fs.chmodSync(scriptPath, 0o755);

        const hook = this.manager.register(
            template.type,
            hookName,
            scriptPath,
            {
                blocking: options.blocking ?? template.blocking,
                scope: this.determineScope(options),
                repos: options.repos || [],
                priority: options.priority || 50,
                description: options.description || template.description
            }
        );

        console.log(`✅ Added ${hookName} hook: ${scriptPath}`);
        console.log(`   Type: ${template.type}`);
        console.log(`   Scope: ${hook.scope}`);
        console.log(`   Blocking: ${hook.blocking}`);

        // Sync to repos if specified
        if (options.allRepos) {
            await this.syncAllRepos();
        } else if (options.repos && options.repos.length > 0) {
            for (const repo of options.repos) {
                this.manager.syncToRepo(repo);
            }
        } else if (template.type === 'git') {
            // Sync to current repo if it's a git hook
            const cwd = process.cwd();
            if (fs.existsSync(path.join(cwd, '.git'))) {
                this.manager.syncToRepo(cwd);
            }
        }

        return true;
    }

    determineScope(options) {
        if (options.global) return 'global';
        if (options.repos && options.repos.length > 0) return 'repo';
        if (options.project) return 'project';
        return 'repo'; // default
    }

    list(filter = {}) {
        console.log('\n📋 Available Hook Types:\n');
        
        Object.entries(this.templates).forEach(([name, template]) => {
            console.log(`  ${name.padEnd(20)} - ${template.description}`);
            console.log(`  ${' '.repeat(20)}   Type: ${template.type}, Blocking: ${template.blocking}`);
        });

        console.log('\n📌 Registered Hooks:\n');
        
        const hooks = this.manager.list(filter);
        
        if (hooks.length === 0) {
            console.log('  No hooks registered yet.');
            return;
        }

        hooks.forEach(hook => {
            const status = hook.enabled ? '✓' : '✗';
            console.log(`  ${status} ${hook.hookId}`);
            console.log(`     Script: ${hook.script}`);
            console.log(`     Scope: ${hook.scope}, Priority: ${hook.priority}`);
            if (hook.repos && hook.repos.length > 0) {
                console.log(`     Repos: ${hook.repos.join(', ')}`);
            }
        });
    }

    enable(hookId, scriptPath = null) {
        if (scriptPath) {
            console.log(`✅ Enabling specific hook: ${hookId} - ${scriptPath}`);
        } else {
            console.log(`✅ Enabling all hooks: ${hookId}`);
        }
        this.manager.toggle(hookId, true);
    }

    disable(hookId, scriptPath = null) {
        if (scriptPath) {
            console.log(`❌ Disabling specific hook: ${hookId} - ${scriptPath}`);
        } else {
            console.log(`❌ Disabling all hooks: ${hookId}`);
        }
        this.manager.toggle(hookId, false);
    }

    remove(hookId, scriptPath = null) {
        this.manager.unregister(hookId, scriptPath);
        console.log(`🗑️  Removed hook: ${hookId}`);
    }

    async syncAllRepos() {
        console.log('🔄 Syncing hooks to all repositories...');
        
        // Find all git repos in common locations
        const searchPaths = [
            path.join(process.env.HOME, 'github.com'),
            path.join(process.env.HOME, 'projects'),
            path.join(process.env.HOME, 'code')
        ];

        let syncCount = 0;
        for (const searchPath of searchPaths) {
            if (fs.existsSync(searchPath)) {
                const repos = this.findGitRepos(searchPath);
                repos.forEach(repo => {
                    if (this.manager.syncToRepo(repo)) {
                        syncCount++;
                    }
                });
            }
        }

        console.log(`✅ Synced hooks to ${syncCount} repositories`);
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
        console.log('   Edit the script and then run:');
        console.log(`   hookify add ${hookName} ${outputPath}`);
    }

    generateTemplate(hookName, template) {
        return `#!/bin/bash
# ChittyOps Hook: ${hookName}
# ${template.description}
#
# This hook was generated by: hookify create ${hookName}
# Edit this script to add your custom logic

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
            } else if (arg === '--global') {
                options.global = true;
            } else if (arg === '--blocking') {
                options.blocking = true;
            } else if (arg === '--non-blocking') {
                options.blocking = false;
            } else if (arg === '--repos') {
                options.repos = args[++i].split(',');
            } else if (arg === '--priority') {
                options.priority = parseInt(args[++i]);
            } else if (arg === '--description') {
                options.description = args[++i];
            } else if (!arg.startsWith('--')) {
                positional.push(arg);
            }
        }

        return { options, positional };
    };

    const showHelp = () => {
        console.log(`
ChittyOps Hookify CLI - Convert any script into a managed hook

USAGE:
  hookify <command> [options]

COMMANDS:
  add <hook-name> <script-path>     Add a script as a hook
  remove <hook-name> [script-path]  Remove a hook
  list                              List all available and registered hooks
  enable <hook-name>                Enable a hook
  disable <hook-name>               Disable a hook
  create <hook-name> <output-path>  Create a template hook script
  sync [repo-path]                  Sync hooks to repository
  sync --all-repos                  Sync hooks to all repositories

OPTIONS:
  --all-repos                       Apply to all repositories
  --global                          Register as global hook
  --repos <repo1,repo2>             Apply to specific repositories
  --blocking                        Make hook blocking (stop on failure)
  --non-blocking                    Make hook non-blocking
  --priority <number>               Set hook priority (default: 50)
  --description <text>              Set hook description

EXAMPLES:
  # Add pre-commit linting to current repo
  hookify add pre-commit ./scripts/lint.sh

  # Add pre-push testing to all repos
  hookify add pre-push ./scripts/test.sh --all-repos

  # Add custom deployment hook
  hookify add pre-deploy ./scripts/check-env.sh --blocking

  # Create a new hook from template
  hookify create pre-commit ./hooks/my-pre-commit.sh

  # List all hooks
  hookify list

  # Sync hooks to all repos
  hookify sync --all-repos
        `);
    };

    switch (command) {
        case 'add': {
            const { options, positional } = parseOptions(args);
            const [hookName, scriptPath] = positional;
            
            if (!hookName || !scriptPath) {
                console.error('❌ Usage: hookify add <hook-name> <script-path>');
                process.exit(1);
            }
            
            cli.add(hookName, scriptPath, options);
            break;
        }

        case 'remove': {
            const { positional } = parseOptions(args);
            const [hookName, scriptPath] = positional;
            
            if (!hookName) {
                console.error('❌ Usage: hookify remove <hook-name> [script-path]');
                process.exit(1);
            }
            
            cli.remove(hookName, scriptPath);
            break;
        }

        case 'list': {
            const { options } = parseOptions(args);
            cli.list(options);
            break;
        }

        case 'enable': {
            const { positional } = parseOptions(args);
            const [hookName, scriptPath] = positional;
            
            if (!hookName) {
                console.error('❌ Usage: hookify enable <hook-name> [script-path]');
                process.exit(1);
            }
            
            cli.enable(hookName, scriptPath);
            break;
        }

        case 'disable': {
            const { positional } = parseOptions(args);
            const [hookName, scriptPath] = positional;
            
            if (!hookName) {
                console.error('❌ Usage: hookify disable <hook-name> [script-path]');
                process.exit(1);
            }
            
            cli.disable(hookName, scriptPath);
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
                cli.syncAllRepos();
            } else {
                const repo = positional[0] || process.cwd();
                cli.manager.syncToRepo(repo);
                console.log(`✅ Synced hooks to ${repo}`);
            }
            break;
        }

        case 'help':
        case '--help':
        case '-h':
            showHelp();
            break;

        default:
            console.error(`❌ Unknown command: ${command}`);
            showHelp();
            process.exit(1);
    }
}

module.exports = { HookifyCLI };

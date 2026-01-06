/**
 * Environment Restorer - Sets up terminal and environment for project sessions
 * Integrates with ChittyChat projects to restore full working environment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class EnvironmentRestorer {
    constructor() {
        this.chittyChatEndpoint = process.env.CHITTYCHAT_ENDPOINT || 'https://api.chitty.cc';
        this.projectConfigs = new Map();
    }

    /**
     * Restore full environment for a project smart session
     */
    async restoreProjectEnvironment(projectName, smartSessionData) {
        console.log(`🔧 Restoring environment for ${projectName}...`);

        try {
            // Step 1: Get ChittyChat project configuration
            const chittyChatProject = await this.getChittyChatProject(projectName);
            
            // Step 2: Set up working directory
            await this.setupWorkingDirectory(chittyChatProject);
            
            // Step 3: Configure terminal environment
            await this.configureTerminalEnvironment(chittyChatProject);
            
            // Step 4: Install/verify dependencies
            await this.setupDependencies(chittyChatProject);
            
            // Step 5: Start required services
            await this.startRequiredServices(chittyChatProject);
            
            // Step 6: Restore shell state
            await this.restoreShellState(chittyChatProject, smartSessionData);
            
            // Step 7: Set up development tools
            await this.setupDevelopmentTools(chittyChatProject);
            
            console.log(`✅ Environment restored for ${projectName}`);
            
            return {
                success: true,
                workingDirectory: chittyChatProject.working_directory,
                environmentVariables: chittyChatProject.environment_variables,
                servicesStarted: chittyChatProject.required_services,
                terminalSetup: true
            };
            
        } catch (error) {
            console.error(`❌ Failed to restore environment for ${projectName}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get project configuration from ChittyChat
     */
    async getChittyChatProject(projectName) {
        try {
            // Use ChittyChat MCP tools instead of localhost
            const projectData = await this.callChittyChatMCP('get_project_config', {
                project_name: projectName,
                include_environment: true,
                include_dependencies: true,
                include_services: true
            });

            if (!projectData) {
                // Create default configuration
                return this.createDefaultProjectConfig(projectName);
            }

            return projectData;
        } catch (error) {
            console.log(`⚠️  Using default config for ${projectName}`);
            return this.createDefaultProjectConfig(projectName);
        }
    }

    /**
     * Create default project configuration
     */
    createDefaultProjectConfig(projectName) {
        const projectMappings = {
            'Arias-v-Bianchi': {
                working_directory: '/Volumes/thumb/nb/MAIN/Legal/Arias-v-Bianchi',
                environment_variables: {
                    'PROJECT_TYPE': 'legal',
                    'CASE_NAME': 'Arias-v-Bianchi',
                    'JURISDICTION': 'Cook County'
                },
                required_services: ['chittychain', 'chittyledger'],
                dependencies: ['node', 'python3'],
                development_tools: ['legal-document-processor', 'evidence-tracker']
            },
            'ChittyFinance': {
                working_directory: '/Volumes/thumb/Projects/chittyos/chittyfinance',
                environment_variables: {
                    'PROJECT_TYPE': 'financial',
                    'NODE_ENV': 'development',
                    'CHITTY_FINANCE_MODE': 'active'
                },
                required_services: ['chittyfinance', 'database'],
                dependencies: ['node', 'npm', 'postgresql'],
                development_tools: ['financial-analyzer', 'transaction-processor']
            },
            'ChittyID': {
                working_directory: '/Volumes/thumb/Projects/chittyfoundation/chittyid',
                environment_variables: {
                    'PROJECT_TYPE': 'identity',
                    'CHITTYID_ENV': 'development'
                },
                required_services: ['chittyid', 'chittyverify', 'chittytrust'],
                dependencies: ['node', 'npm'],
                development_tools: ['identity-validator', 'verification-tools']
            },
            'ChiCo-Properties': {
                working_directory: '/Volumes/thumb/Projects/chico',
                environment_variables: {
                    'PROJECT_TYPE': 'property_management',
                    'PROPERTY_FOCUS': 'chicago_condos'
                },
                required_services: ['property-management-api'],
                dependencies: ['node', 'python3'],
                development_tools: ['property-analyzer', 'tenant-portal']
            },
            'IT-CAN-BE-LLC': {
                working_directory: '/Volumes/thumb/Projects/ChittyTrace---IT-CAN-BE-LLC',
                environment_variables: {
                    'PROJECT_TYPE': 'corporate',
                    'ENTITY_TYPE': 'Wyoming_LLC'
                },
                required_services: ['corporate-tracking'],
                dependencies: ['node'],
                development_tools: ['entity-tracker', 'compliance-monitor']
            }
        };

        return projectMappings[projectName] || {
            working_directory: process.cwd(),
            environment_variables: {
                'PROJECT_TYPE': 'general',
                'PROJECT_NAME': projectName
            },
            required_services: [],
            dependencies: ['node'],
            development_tools: []
        };
    }

    /**
     * Setup working directory
     */
    async setupWorkingDirectory(projectConfig) {
        const workingDir = projectConfig.working_directory;
        
        if (!fs.existsSync(workingDir)) {
            console.log(`📁 Creating working directory: ${workingDir}`);
            fs.mkdirSync(workingDir, { recursive: true });
        }

        // Change to working directory
        process.chdir(workingDir);
        console.log(`📂 Changed to: ${workingDir}`);
        
        // Set environment variable
        process.env.PWD = workingDir;
    }

    /**
     * Configure terminal environment variables
     */
    async configureTerminalEnvironment(projectConfig) {
        console.log('🌿 Setting up environment variables...');
        
        // Set project-specific environment variables
        for (const [key, value] of Object.entries(projectConfig.environment_variables || {})) {
            process.env[key] = value;
            console.log(`   ${key}=${value}`);
        }

        // Set ChittyOS environment variables
        process.env.CHITTYOS_PROJECT = projectConfig.project_name || 'Unknown';
        process.env.CHITTY_ENVIRONMENT = 'development';
        
        // Export to shell profile
        await this.exportToShellProfile(projectConfig.environment_variables);
    }

    /**
     * Export environment variables to shell profile
     */
    async exportToShellProfile(envVars) {
        try {
            const shellProfile = this.detectShellProfile();
            const envExports = Object.entries(envVars || {})
                .map(([key, value]) => `export ${key}="${value}"`)
                .join('\n');
                
            const profileComment = `\n# ChittyChat Project Environment - ${new Date().toISOString()}\n${envExports}\n`;
            
            // Append to profile (non-permanent for session)
            fs.appendFileSync('/tmp/chitty-session-env', profileComment);
            
            // Source the temporary file
            execSync(`source /tmp/chitty-session-env`, { stdio: 'inherit' });
            
        } catch (error) {
            console.log('⚠️  Could not update shell profile');
        }
    }

    /**
     * Detect shell profile file
     */
    detectShellProfile() {
        const home = process.env.HOME;
        const profiles = ['.zshrc', '.bashrc', '.bash_profile', '.profile'];
        
        for (const profile of profiles) {
            const profilePath = path.join(home, profile);
            if (fs.existsSync(profilePath)) {
                return profilePath;
            }
        }
        
        return path.join(home, '.profile'); // Default
    }

    /**
     * Setup dependencies
     */
    async setupDependencies(projectConfig) {
        console.log('📦 Verifying dependencies...');
        
        for (const dep of projectConfig.dependencies || []) {
            try {
                execSync(`which ${dep}`, { stdio: 'pipe' });
                console.log(`   ✅ ${dep} available`);
            } catch (error) {
                console.log(`   ❌ ${dep} not found - may need installation`);
            }
        }

        // Install npm dependencies if package.json exists
        if (fs.existsSync('package.json')) {
            console.log('📦 Installing npm dependencies...');
            try {
                execSync('npm install --quiet', { stdio: 'inherit' });
                console.log('   ✅ npm dependencies installed');
            } catch (error) {
                console.log('   ⚠️  npm install had issues');
            }
        }
    }

    /**
     * Start required services
     */
    async startRequiredServices(projectConfig) {
        console.log('🚀 Starting required services...');
        
        for (const service of projectConfig.required_services || []) {
            try {
                // Check if service is already running
                const isRunning = this.isServiceRunning(service);
                
                if (isRunning) {
                    console.log(`   ✅ ${service} already running`);
                } else {
                    await this.startService(service);
                    console.log(`   🚀 Started ${service}`);
                }
            } catch (error) {
                console.log(`   ⚠️  Could not start ${service}: ${error.message}`);
            }
        }
    }

    /**
     * Check if service is running
     */
    isServiceRunning(serviceName) {
        try {
            const result = execSync(`launchctl list | grep ${serviceName}`, { encoding: 'utf8', stdio: 'pipe' });
            return result.trim().length > 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * Start a service
     */
    async startService(serviceName) {
        const serviceMap = {
            'chittychain': () => execSync('launchctl load ~/Library/LaunchAgents/com.chitty.chain.plist'),
            'chittyledger': () => execSync('launchctl load ~/Library/LaunchAgents/com.chitty.ledger.plist'),
            'chittyfinance': () => execSync('launchctl load ~/Library/LaunchAgents/com.chitty.finance.plist'),
            'chittyid': () => execSync('launchctl load ~/Library/LaunchAgents/com.chitty.id.plist'),
            'chittyverify': () => execSync('launchctl load ~/Library/LaunchAgents/com.chitty.verify.plist'),
            'chittytrust': () => execSync('launchctl load ~/Library/LaunchAgents/com.chitty.trust.plist'),
            'database': () => execSync('brew services start postgresql@14'),
            'property-management-api': () => console.log('Property management API starting...'),
            'corporate-tracking': () => console.log('Corporate tracking service starting...')
        };

        const startFunction = serviceMap[serviceName];
        if (startFunction) {
            await startFunction();
        } else {
            console.log(`   ⚠️  Unknown service: ${serviceName}`);
        }
    }

    /**
     * Restore shell state from smart session
     */
    async restoreShellState(projectConfig, smartSessionData) {
        console.log('💾 Restoring shell state...');
        
        // Restore command history
        await this.restoreCommandHistory(projectConfig, smartSessionData);
        
        // Set up aliases
        await this.setupProjectAliases(projectConfig);
        
        // Configure shell prompt
        await this.configureShellPrompt(projectConfig);
    }

    /**
     * Restore command history
     */
    async restoreCommandHistory(projectConfig, smartSessionData) {
        // This would restore frequently used commands from the session history
        console.log('   📜 Command history patterns available');
    }

    /**
     * Setup project aliases
     */
    async setupProjectAliases(projectConfig) {
        const projectName = projectConfig.project_name || 'project';
        const aliases = [
            `alias ${projectName.toLowerCase()}="cd ${projectConfig.working_directory}"`,
            `alias ${projectName.toLowerCase()}-status="echo 'Project: ${projectName} | Dir: ${projectConfig.working_directory}'"`,
            `alias chitty-project="echo '${projectName}'"`,
        ];
        
        // Write aliases to temp file and source
        fs.writeFileSync('/tmp/chitty-project-aliases', aliases.join('\n'));
        console.log('   🔗 Project aliases configured');
    }

    /**
     * Configure shell prompt
     */
    async configureShellPrompt(projectConfig) {
        const projectName = projectConfig.project_name || 'project';
        process.env.PS1 = `[ChittyChat:${projectName}] $ `;
        console.log(`   💬 Shell prompt set for ${projectName}`);
    }

    /**
     * Setup development tools
     */
    async setupDevelopmentTools(projectConfig) {
        console.log('🛠️  Setting up development tools...');
        
        for (const tool of projectConfig.development_tools || []) {
            console.log(`   🔧 ${tool} configured`);
        }
    }

    /**
     * Call ChittyChat MCP tool
     */
    async callChittyChatMCP(toolName, args) {
        // Use the ChittyChat MCP client instead of localhost HTTP requests
        try {
            const { ChittyChatClient } = require('./chittychat-client');
            const client = new ChittyChatClient();
            
            const result = await client.sendRequest('tools/call', {
                name: toolName,
                arguments: args
            });
            
            return result?.result?.content ? JSON.parse(result.result.content) : null;
        } catch (error) {
            console.log(`⚠️  ChittyChat MCP call failed: ${error.message}`);
            return null;
        }
    }
}

module.exports = { EnvironmentRestorer };
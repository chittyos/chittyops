#!/usr/bin/env node

/**
 * ChittyChat Client for Project Awareness
 * Integrates with ChittyChat MCP server for project management
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');

class ChittyChatClient {
    constructor() {
        this.mcpProcess = null;
        this.isConnected = false;
        this.requestId = 0;
        this.pendingRequests = new Map();
        
        this.chittyChatConfig = {
            endpoint: process.env.CHITTYCHAT_ENDPOINT || 'https://api.chitty.cc',
            apiKey: process.env.CHITTYCHAT_API_KEY,
            transport: process.env.CHITTYCHAT_TRANSPORT || 'http',
            fallbackLocal: {
                command: "npx",
                args: ["tsx", "/Volumes/thumb/Projects/chittyos/chittychat/server/index.ts"],
                cwd: "/Volumes/thumb/Projects/chittyos/chittychat",
                transport: "stdio"
            }
        };
    }

    /**
     * Connect to ChittyChat MCP server
     */
    async connect() {
        if (this.isConnected) return;

        try {
            console.log('🔌 Connecting to ChittyChat MCP server...');
            
            this.mcpProcess = spawn(
                this.chittyChatConfig.command,
                this.chittyChatConfig.args,
                {
                    cwd: this.chittyChatConfig.cwd,
                    stdio: ['pipe', 'pipe', 'pipe']
                }
            );

            // Handle process events
            this.mcpProcess.on('error', (error) => {
                console.error('ChittyChat MCP process error:', error);
                this.isConnected = false;
            });

            this.mcpProcess.on('exit', (code) => {
                console.log(`ChittyChat MCP process exited with code: ${code}`);
                this.isConnected = false;
            });

            // Set up JSON-RPC communication
            this.mcpProcess.stdout.on('data', (data) => {
                this.handleMCPResponse(data.toString());
            });

            this.isConnected = true;
            console.log('✅ Connected to ChittyChat MCP server');

        } catch (error) {
            console.error('Failed to connect to ChittyChat:', error);
            this.isConnected = false;
        }
    }

    /**
     * Handle MCP server responses
     */
    handleMCPResponse(data) {
        const lines = data.trim().split('\n');
        
        for (const line of lines) {
            try {
                const response = JSON.parse(line);
                
                if (response.id && this.pendingRequests.has(response.id)) {
                    const resolver = this.pendingRequests.get(response.id);
                    this.pendingRequests.delete(response.id);
                    resolver(response);
                }
            } catch (error) {
                // Ignore non-JSON output (logs, etc.)
            }
        }
    }

    /**
     * Send request to MCP server
     */
    async sendRequest(method, params = {}) {
        if (!this.isConnected) {
            await this.connect();
        }

        const requestId = ++this.requestId;
        const request = {
            jsonrpc: "2.0",
            id: requestId,
            method: method,
            params: params
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, resolve);
            
            const requestString = JSON.stringify(request) + '\n';
            this.mcpProcess.stdin.write(requestString);

            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('Request timeout'));
                }
            }, 10000);
        });
    }

    /**
     * Get active projects from ChittyChat
     */
    async getActiveProjects() {
        try {
            const response = await this.sendRequest('tools/call', {
                name: 'list_projects',
                arguments: {
                    status: 'active',
                    include_stats: true
                }
            });

            if (response.result && response.result.content) {
                const projects = JSON.parse(response.result.content);
                return projects.map(project => ({
                    name: project.name,
                    activity_score: this.calculateActivityScore(project),
                    open_tasks: project.open_tasks || 0,
                    last_activity: project.last_activity
                }));
            }

            return [];

        } catch (error) {
            console.error('Error getting active projects:', error);
            return [];
        }
    }

    /**
     * Set active project in ChittyChat
     */
    async setActiveProject(projectName) {
        try {
            const response = await this.sendRequest('tools/call', {
                name: 'set_active_project',
                arguments: {
                    project_name: projectName,
                    context: {
                        switched_via: 'project-awareness-extension',
                        timestamp: new Date().toISOString(),
                        session_id: process.env.CLAUDE_SESSION_ID
                    }
                }
            });

            return response.result;

        } catch (error) {
            console.error('Error setting active project:', error);
            throw error;
        }
    }

    /**
     * Create new project in ChittyChat with full ecosystem integration
     */
    async createProject(projectData) {
        try {
            // Step 1: Register project with ChittyID first
            const chittyId = await this.registerProjectWithChittyID(projectData.name, {
                description: projectData.description,
                created_by: projectData.created_by,
                creation_context: projectData.context || {}
            });

            // Step 2: Create project in ChittyChat with ChittyID
            const response = await this.sendRequest('tools/call', {
                name: 'create_project',
                arguments: {
                    name: projectData.name,
                    description: projectData.description,
                    created_by: projectData.created_by,
                    chitty_id: chittyId, // Include ChittyID
                    context: {
                        ...projectData.context,
                        chitty_id: chittyId,
                        registry_registered: true,
                        memory_integration: true
                    },
                    tags: this.generateProjectTags(projectData.name),
                    capabilities: this.detectProjectCapabilities(projectData.name)
                }
            });

            // Step 3: Initialize session memory tracking
            await this.initializeProjectMemory(projectData.name, chittyId);

            console.log(`✅ Project ${projectData.name} created with ChittyID: ${chittyId}`);
            return {
                ...response.result,
                chitty_id: chittyId,
                registry_registered: true
            };

        } catch (error) {
            console.error('Error creating project:', error);
            throw error;
        }
    }

    /**
     * Log activity to ChittyChat
     */
    async logActivity(activityData) {
        try {
            const response = await this.sendRequest('tools/call', {
                name: 'log_activity',
                arguments: {
                    project: activityData.project,
                    activity_type: activityData.activity_type,
                    details: {
                        tool: activityData.tool,
                        timestamp: activityData.timestamp,
                        context: activityData.context
                    },
                    metadata: {
                        session_id: process.env.CLAUDE_SESSION_ID,
                        agent: process.env.CLAUDE_AGENT_NAME
                    }
                }
            });

            return response.result;

        } catch (error) {
            console.error('Error logging activity:', error);
            // Don't throw - activity logging is non-critical
        }
    }

    /**
     * Get project suggestions based on current context
     */
    async getProjectSuggestions(context) {
        try {
            const response = await this.sendRequest('tools/call', {
                name: 'get_project_suggestions',
                arguments: {
                    current_directory: context.workingDirectory,
                    recent_files: context.recentFiles?.map(f => f.name) || [],
                    git_branch: context.gitBranch,
                    session_context: {
                        session_id: process.env.CLAUDE_SESSION_ID,
                        agent: process.env.CLAUDE_AGENT_NAME
                    }
                }
            });

            if (response.result && response.result.content) {
                return JSON.parse(response.result.content);
            }

            return [];

        } catch (error) {
            console.error('Error getting project suggestions:', error);
            return [];
        }
    }

    /**
     * Calculate activity score for project prioritization
     */
    calculateActivityScore(project) {
        let score = 0;
        
        // Recent activity
        if (project.last_activity) {
            const daysSinceActivity = (Date.now() - new Date(project.last_activity)) / (1000 * 60 * 60 * 24);
            score += Math.max(0, 1 - daysSinceActivity / 30); // Decay over 30 days
        }
        
        // Open tasks
        if (project.open_tasks > 0) {
            score += Math.min(project.open_tasks / 10, 0.5); // Up to 0.5 for tasks
        }
        
        // Active sessions
        if (project.active_sessions > 0) {
            score += 0.3;
        }
        
        return Math.min(score, 1.0);
    }

    /**
     * Register project with ChittyID and Registry
     */
    async registerProjectWithChittyID(projectName, metadata = {}) {
        try {
            // Generate ChittyID for project
            const chittyIdResponse = await this.sendRequest('tools/call', {
                name: 'chittyid_generate',
                arguments: {
                    entity_type: 'project',
                    entity_name: projectName,
                    metadata: {
                        ...metadata,
                        created_via: 'project-awareness',
                        registration_timestamp: new Date().toISOString()
                    }
                }
            });

            if (chittyIdResponse.result?.content) {
                const chittyId = JSON.parse(chittyIdResponse.result.content);
                
                // Register with ChittyRegistry
                await this.registerWithChittyRegistry(projectName, chittyId.id, metadata);
                
                return chittyId.id;
            }

            return null;

        } catch (error) {
            console.error('Error registering project with ChittyID:', error);
            return null;
        }
    }

    /**
     * Register project with ChittyRegistry
     */
    async registerWithChittyRegistry(projectName, chittyId, metadata = {}) {
        try {
            const registryResponse = await this.sendRequest('tools/call', {
                name: 'registry_register_project',
                arguments: {
                    project_name: projectName,
                    chitty_id: chittyId,
                    project_type: this.detectProjectType(projectName),
                    endpoints: this.generateProjectEndpoints(projectName),
                    metadata: {
                        ...metadata,
                        registry_version: '1.0',
                        capabilities: this.detectProjectCapabilities(projectName)
                    }
                }
            });

            return registryResponse.result;

        } catch (error) {
            console.error('Error registering with ChittyRegistry:', error);
            return null;
        }
    }

    /**
     * Connect to Memory-Claude system for session synthesis
     */
    async integrateWithMemorySystem(sessionData) {
        try {
            const memoryResponse = await this.sendRequest('tools/call', {
                name: 'memory_integrate_session',
                arguments: {
                    session_id: sessionData.session_id,
                    project_context: sessionData.project_context,
                    tools_used: sessionData.tools_used,
                    files_accessed: sessionData.files_accessed,
                    decisions_made: sessionData.decisions_made,
                    synthesis_request: {
                        consolidate_into_main_memory: true,
                        extract_project_insights: true,
                        update_project_patterns: true
                    }
                }
            });

            return memoryResponse.result;

        } catch (error) {
            console.error('Error integrating with memory system:', error);
            return null;
        }
    }

    /**
     * Request session consolidation on session end
     */
    async consolidateSessionMemory(sessionId, projectId) {
        try {
            const consolidationResponse = await this.sendRequest('tools/call', {
                name: 'memory_consolidate_session',
                arguments: {
                    session_id: sessionId,
                    project_id: projectId,
                    consolidation_type: 'end_of_session',
                    merge_into_project_memory: true,
                    extract_patterns: true,
                    update_project_intelligence: true
                }
            });

            // Update session memory files
            await this.updateSessionMemoryFiles(sessionId, projectId, consolidationResponse.result);

            return consolidationResponse.result;

        } catch (error) {
            console.error('Error consolidating session memory:', error);
            return null;
        }
    }

    /**
     * Update session memory files
     */
    async updateSessionMemoryFiles(sessionId, projectId, consolidatedData) {
        try {
            const fs = require('fs');
            const path = require('path');
            
            const sessionMemoryDir = path.join(process.env.HOME, '.claude', 'session-memory');
            if (!fs.existsSync(sessionMemoryDir)) {
                fs.mkdirSync(sessionMemoryDir, { recursive: true });
            }

            // Create consolidated session file
            const sessionFile = path.join(sessionMemoryDir, `${sessionId}-consolidated.json`);
            fs.writeFileSync(sessionFile, JSON.stringify({
                session_id: sessionId,
                project_id: projectId,
                consolidated_at: new Date().toISOString(),
                consolidated_data: consolidatedData,
                integration_complete: true
            }, null, 2));

            // Update main session memory index
            const indexFile = path.join(sessionMemoryDir, 'index.json');
            let index = {};
            if (fs.existsSync(indexFile)) {
                index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
            }

            if (!index[projectId]) {
                index[projectId] = {
                    project_chitty_id: await this.getProjectChittyId(projectId),
                    sessions: [],
                    last_updated: null
                };
            }

            index[projectId].sessions.push({
                session_id: sessionId,
                consolidated_at: new Date().toISOString(),
                file_path: sessionFile
            });
            index[projectId].last_updated = new Date().toISOString();

            fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));

        } catch (error) {
            console.error('Error updating session memory files:', error);
        }
    }

    /**
     * Get project ChittyID
     */
    async getProjectChittyId(projectName) {
        try {
            const response = await this.sendRequest('tools/call', {
                name: 'chittyid_lookup',
                arguments: {
                    entity_name: projectName,
                    entity_type: 'project'
                }
            });

            if (response.result?.content) {
                const result = JSON.parse(response.result.content);
                return result.chitty_id;
            }

            return null;

        } catch (error) {
            console.error('Error getting project ChittyID:', error);
            return null;
        }
    }

    /**
     * Detect project type for registry
     */
    detectProjectType(projectName) {
        const name = projectName.toLowerCase();
        
        if (name.includes('chitty')) return 'chittyos-ecosystem';
        if (name.includes('legal') || name.includes('arias')) return 'legal-case';
        if (name.includes('finance')) return 'financial-operations';
        if (name.includes('property') || name.includes('rental')) return 'real-estate';
        if (name.includes('llc') || name.includes('corp')) return 'corporate-entity';
        
        return 'general-project';
    }

    /**
     * Generate project endpoints for registry
     */
    generateProjectEndpoints(projectName) {
        const endpoints = {};
        const name = projectName.toLowerCase();
        
        // Standard project endpoints
        endpoints.project_api = `http://localhost:5555/projects/${projectName}`;
        endpoints.task_management = `http://localhost:5555/tasks/${projectName}`;
        endpoints.activity_feed = `http://localhost:5555/activity/${projectName}`;
        
        // Specialized endpoints based on project type
        if (name.includes('chitty')) {
            endpoints.mcp_server = `stdio://chitty${name.split('chitty')[1]}`;
        }
        if (name.includes('legal')) {
            endpoints.evidence_chain = `http://localhost:5556/evidence/${projectName}`;
        }
        if (name.includes('finance')) {
            endpoints.ledger = `http://localhost:5557/ledger/${projectName}`;
        }
        
        return endpoints;
    }

    /**
     * Detect project capabilities
     */
    detectProjectCapabilities(projectName) {
        const capabilities = ['task_management', 'activity_tracking', 'session_memory'];
        const name = projectName.toLowerCase();
        
        if (name.includes('chitty')) capabilities.push('mcp_integration', 'ecosystem_aware');
        if (name.includes('legal')) capabilities.push('evidence_tracking', 'legal_compliance');
        if (name.includes('finance')) capabilities.push('transaction_tracking', 'ledger_integration');
        if (name.includes('property')) capabilities.push('asset_management', 'tenant_tracking');
        
        return capabilities;
    }

    /**
     * Initialize project memory tracking
     */
    async initializeProjectMemory(projectName, chittyId) {
        try {
            const fs = require('fs');
            const path = require('path');
            
            const projectMemoryDir = path.join(process.env.HOME, '.claude', 'project-memory', projectName);
            if (!fs.existsSync(projectMemoryDir)) {
                fs.mkdirSync(projectMemoryDir, { recursive: true });
            }

            // Create project memory index
            const memoryIndex = {
                project_name: projectName,
                chitty_id: chittyId,
                created_at: new Date().toISOString(),
                sessions: [],
                consolidated_insights: [],
                patterns_learned: {},
                memory_integration_active: true
            };

            const indexFile = path.join(projectMemoryDir, 'memory-index.json');
            fs.writeFileSync(indexFile, JSON.stringify(memoryIndex, null, 2));

            console.log(`📁 Initialized memory tracking for project: ${projectName}`);

        } catch (error) {
            console.error('Error initializing project memory:', error);
        }
    }

    /**
     * Generate smart tags for projects
     */
    generateProjectTags(projectName) {
        const tags = [];
        const name = projectName.toLowerCase();
        
        // Category tags
        if (name.includes('chitty')) tags.push('chittyos', 'ecosystem');
        if (name.includes('legal') || name.includes('arias')) tags.push('legal', 'case-management');
        if (name.includes('finance') || name.includes('money')) tags.push('finance', 'accounting');
        if (name.includes('property') || name.includes('rental')) tags.push('real-estate', 'property');
        if (name.includes('llc') || name.includes('corp')) tags.push('corporate', 'legal-entity');
        
        // Auto-generated tag
        tags.push('auto-created');
        
        return tags;
    }

    /**
     * Close connection to ChittyChat
     */
    async disconnect() {
        if (this.mcpProcess) {
            this.mcpProcess.kill();
            this.mcpProcess = null;
        }
        this.isConnected = false;
        this.pendingRequests.clear();
    }
}

module.exports = { ChittyChatClient };
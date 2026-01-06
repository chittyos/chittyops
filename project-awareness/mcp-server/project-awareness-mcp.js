#!/usr/bin/env node

/**
 * ChittyChat Project Awareness MCP Server
 * Exposes project awareness functionality as MCP tools
 */

const { Server } = require('@modelcontextprotocol/sdk/server');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio');
const ProjectAwarenessExtension = require('../index.js');

class ProjectAwarenessMCPServer {
    constructor() {
        this.server = new Server(
            {
                name: "chittyops-project-awareness",
                version: "1.0.0",
                description: "ChittyOps Project Awareness - Cross-session intelligence with ChittyID integration"
            },
            {
                capabilities: {
                    tools: {}
                }
            }
        );

        this.projectAwareness = new ProjectAwarenessExtension();
        this.setupTools();
    }

    setupTools() {
        // Tool: Get project suggestions
        this.server.setRequestHandler('tools/call', async (request) => {
            const { name, arguments: args } = request.params;
            
            switch (name) {
                case 'get_project_suggestions':
                    return await this.getProjectSuggestions(args);
                    
                case 'set_active_project':
                    return await this.setActiveProject(args);
                    
                case 'analyze_current_context':
                    return await this.analyzeCurrentContext(args);
                    
                case 'force_session_alignment':
                    return await this.forceSessionAlignment(args);
                    
                case 'consolidate_session_memory':
                    return await this.consolidateSessionMemory(args);
                    
                case 'get_project_statistics':
                    return await this.getProjectStatistics(args);
                    
                case 'cross_platform_sync':
                    return await this.crossPlatformSync(args);
                    
                case 'register_platform_session':
                    return await this.registerPlatformSession(args);
                    
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });

        // List available tools
        this.server.setRequestHandler('tools/list', async () => {
            return {
                tools: [
                    {
                        name: 'get_project_suggestions',
                        description: 'Get intelligent project suggestions based on current context',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                context: {
                                    type: 'object',
                                    properties: {
                                        workingDirectory: { type: 'string' },
                                        recentFiles: { type: 'array' },
                                        gitBranch: { type: 'string' },
                                        platform: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    {
                        name: 'set_active_project',
                        description: 'Set the active project and sync across platforms',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                project_name: { type: 'string' },
                                platform: { type: 'string' },
                                context: { type: 'object' }
                            },
                            required: ['project_name']
                        }
                    },
                    {
                        name: 'analyze_current_context',
                        description: 'Analyze current context for project detection',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                workingDirectory: { type: 'string' },
                                platform: { type: 'string' }
                            }
                        }
                    },
                    {
                        name: 'force_session_alignment',
                        description: 'Force cross-session alignment before critical operations',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                platform: { type: 'string' },
                                reason: { type: 'string' }
                            }
                        }
                    },
                    {
                        name: 'consolidate_session_memory',
                        description: 'Consolidate session memory into long-term memory',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                session_id: { type: 'string' },
                                project_id: { type: 'string' },
                                platform: { type: 'string' },
                                session_data: { type: 'object' }
                            },
                            required: ['session_id']
                        }
                    },
                    {
                        name: 'get_project_statistics',
                        description: 'Get project usage statistics and analytics',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                project_name: { type: 'string' },
                                time_range: { type: 'string' }
                            }
                        }
                    },
                    {
                        name: 'cross_platform_sync',
                        description: 'Synchronize project context across all connected platforms',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                source_platform: { type: 'string' },
                                sync_type: { 
                                    type: 'string',
                                    enum: ['project_switch', 'session_start', 'session_end', 'memory_update']
                                },
                                data: { type: 'object' }
                            },
                            required: ['source_platform', 'sync_type', 'data']
                        }
                    },
                    {
                        name: 'register_platform_session',
                        description: 'Register a new session from any platform',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                platform: { 
                                    type: 'string',
                                    enum: ['claude-code', 'claude-desktop', 'claude-web', 'openai-customgpt', 'chatgpt']
                                },
                                session_id: { type: 'string' },
                                user_id: { type: 'string' },
                                context: { type: 'object' }
                            },
                            required: ['platform', 'session_id']
                        }
                    }
                ]
            };
        });
    }

    async getProjectSuggestions(args) {
        try {
            const context = args.context || {};
            const suggestions = await this.projectAwareness.getProjectSuggestions(context);
            
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            suggestions,
                            platform: args.platform || 'unknown',
                            timestamp: new Date().toISOString()
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get project suggestions: ${error.message}`);
        }
    }

    async setActiveProject(args) {
        try {
            const { project_name, platform, context } = args;
            
            // Set project in local awareness
            await this.projectAwareness.switchProject(project_name);
            
            // Sync across platforms if specified
            if (platform) {
                await this.syncProjectAcrossPlatforms(project_name, platform, context);
            }
            
            return {
                content: [
                    {
                        type: 'text', 
                        text: JSON.stringify({
                            success: true,
                            active_project: project_name,
                            platform: platform,
                            synced_at: new Date().toISOString()
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to set active project: ${error.message}`);
        }
    }

    async analyzeCurrentContext(args) {
        try {
            const context = await this.projectAwareness.analyzeCurrentContext();
            
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            context,
                            platform: args.platform || 'unknown',
                            analyzed_at: new Date().toISOString()
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to analyze context: ${error.message}`);
        }
    }

    async forceSessionAlignment(args) {
        try {
            await this.projectAwareness.forceSessionRestoration();
            
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            alignment_completed: true,
                            platform: args.platform || 'unknown',
                            reason: args.reason || 'manual_request',
                            aligned_at: new Date().toISOString()
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to force session alignment: ${error.message}`);
        }
    }

    async consolidateSessionMemory(args) {
        try {
            const { session_id, project_id, platform, session_data } = args;
            
            const consolidationResult = await this.projectAwareness.chittyChatClient.consolidateSessionMemory(
                session_id,
                project_id || this.projectAwareness.currentProject
            );
            
            // If session_data provided, integrate it
            if (session_data) {
                await this.projectAwareness.chittyChatClient.integrateWithMemorySystem({
                    session_id,
                    project_context: project_id,
                    platform: platform || 'unknown',
                    ...session_data
                });
            }
            
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            session_id,
                            consolidation_result: consolidationResult,
                            consolidated_at: new Date().toISOString()
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to consolidate session memory: ${error.message}`);
        }
    }

    async getProjectStatistics(args) {
        try {
            const stats = await this.projectAwareness.projectAnalyzer.getProjectStats();
            
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            statistics: stats,
                            project_name: args.project_name,
                            time_range: args.time_range || 'all',
                            generated_at: new Date().toISOString()
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get project statistics: ${error.message}`);
        }
    }

    async crossPlatformSync(args) {
        try {
            const { source_platform, sync_type, data } = args;
            
            // Handle different sync types
            switch (sync_type) {
                case 'project_switch':
                    await this.syncProjectSwitch(source_platform, data);
                    break;
                case 'session_start':
                    await this.syncSessionStart(source_platform, data);
                    break;
                case 'session_end':
                    await this.syncSessionEnd(source_platform, data);
                    break;
                case 'memory_update':
                    await this.syncMemoryUpdate(source_platform, data);
                    break;
            }
            
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            sync_type,
                            source_platform,
                            synced_platforms: await this.getConnectedPlatforms(),
                            synced_at: new Date().toISOString()
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to sync across platforms: ${error.message}`);
        }
    }

    async registerPlatformSession(args) {
        try {
            const { platform, session_id, user_id, context } = args;
            
            // Register session with platform tracking
            await this.registerSession(platform, session_id, user_id, context);
            
            // Get project suggestions for new session
            const suggestions = await this.getProjectSuggestions({ context });
            
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            platform,
                            session_id,
                            registered_at: new Date().toISOString(),
                            project_suggestions: JSON.parse(suggestions.content[0].text).suggestions
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to register platform session: ${error.message}`);
        }
    }

    // Helper methods
    async syncProjectAcrossPlatforms(projectName, sourcePlatform, context) {
        // Implementation for cross-platform project sync
        console.log(`🔄 Syncing project ${projectName} from ${sourcePlatform}`);
    }

    async getConnectedPlatforms() {
        // Return list of currently connected platforms
        return ['claude-code', 'claude-desktop', 'claude-web'];
    }

    async registerSession(platform, sessionId, userId, context) {
        // Register session in central registry
        console.log(`📝 Registering session ${sessionId} from ${platform}`);
    }

    async syncProjectSwitch(platform, data) {
        // Sync project switch across platforms
        console.log(`🔄 Syncing project switch from ${platform}:`, data);
    }

    async syncSessionStart(platform, data) {
        // Sync session start across platforms
        console.log(`▶️ Syncing session start from ${platform}:`, data);
    }

    async syncSessionEnd(platform, data) {
        // Sync session end across platforms
        console.log(`⏹️ Syncing session end from ${platform}:`, data);
    }

    async syncMemoryUpdate(platform, data) {
        // Sync memory update across platforms
        console.log(`🧠 Syncing memory update from ${platform}:`, data);
    }

    async start() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('🧠 ChittyOps Project Awareness MCP Server running');
    }
}

// Start server if run directly
if (require.main === module) {
    const server = new ProjectAwarenessMCPServer();
    server.start().catch(console.error);
}

module.exports = { ProjectAwarenessMCPServer };
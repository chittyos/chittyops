#!/usr/bin/env node

/**
 * /projects - List all available projects with smart context
 */

const fs = require('fs');
const path = require('path');

class ProjectsCommand {
    constructor() {
        this.projectAwarenessPath = path.join(process.env.HOME, '.claude', 'extensions', 'project-awareness');
    }

    async execute(args = []) {
        console.log('🧠 **ChittyChat Project Awareness - All Projects**\n');
        
        const command = args[0];
        
        switch (command) {
            case 'active':
                await this.listActiveProjects();
                break;
            case 'stats':
                await this.showProjectStats();
                break;
            case 'current':
                await this.showCurrentProject();
                break;
            case 'switch':
                await this.switchProject(args[1]);
                break;
            default:
                await this.listAllProjects();
        }
    }

    async listAllProjects() {
        console.log('## **All Available Projects:**\n');
        
        const projects = {
            'Legal & Compliance': [
                { name: 'Arias-v-Bianchi', sessions: '29+', status: 'ACTIVE', description: 'Active litigation, evidence processing' },
                { name: 'Tax-Abatement', sessions: '2', status: 'ACTIVE', description: 'Property tax legal issues' },
                { name: 'Legal-Consultant', sessions: '1', status: 'AVAILABLE', description: 'General legal support' }
            ],
            'ChittyOS Ecosystem': [
                { name: 'ChittyOS-Core', sessions: '11+', status: 'ACTIVE', description: 'Main OS, MCP servers' },
                { name: 'ChittyFinance', sessions: '56+', status: 'ACTIVE', description: 'Financial operations' },
                { name: 'ChittyChat', sessions: '5', status: 'ACTIVE', description: 'Project management' },
                { name: 'ChittyScore', sessions: '1', status: 'DEPLOYED', description: 'Trust scoring (score.chitty.cc)' },
                { name: 'ChittyChain', sessions: '10+', status: 'ACTIVE', description: 'Blockchain evidence' },
                { name: 'ChittyRegistry', sessions: '0', status: 'INFRASTRUCTURE', description: 'Service discovery' },
                { name: 'ChittyID', sessions: '24+', status: 'ACTIVE', description: 'Identity verification' },
                { name: 'ChittyCanon', sessions: '3', status: 'DEVELOPING', description: 'Standards system' }
            ],
            'Business Operations': [
                { name: 'ChiCo-Properties', sessions: '39+', status: 'ACTIVE', description: 'Chicago property management' },
                { name: 'Furnished-Condos', sessions: '6', status: 'ACTIVE', description: 'Short-term rentals' },
                { name: 'Credit-Rep', sessions: '2', status: 'AVAILABLE', description: 'Tenant screening' }
            ],
            'Corporate Structure': [
                { name: 'IT-CAN-BE-LLC', sessions: '19+', status: 'ACTIVE', description: 'Wyoming LLC operations' },
                { name: 'ChittyCorp', sessions: '4', status: 'DEVELOPING', description: 'Corporate entity development' },
                { name: 'ChittyFoundation', sessions: '8+', status: 'PLANNING', description: 'Non-profit foundation' }
            ],
            'Infrastructure': [
                { name: 'Google-Workspace-Migration', sessions: '14', status: 'IN-PROGRESS', description: 'Email/productivity transition' },
                { name: 'Claude-Extensions', sessions: '13', status: 'ACTIVE', description: 'AI agent development' },
                { name: 'Project-Awareness', sessions: '1', status: 'DEPLOYED', description: 'This intelligent system' }
            ]
        };

        for (const [category, projectList] of Object.entries(projects)) {
            console.log(`### **${category}**`);
            projectList.forEach(project => {
                const statusEmoji = this.getStatusEmoji(project.status);
                console.log(`- ${statusEmoji} **${project.name}** (${project.sessions} sessions) - ${project.description}`);
            });
            console.log('');
        }

        console.log('## **Quick Commands:**');
        console.log('- `/projects active` - Show only active projects');
        console.log('- `/projects stats` - Show usage statistics');
        console.log('- `/projects current` - Show current project');
        console.log('- `/projects switch <name>` - Switch to project');
        console.log('');

        // Show current project if available
        await this.showCurrentProject();
    }

    async listActiveProjects() {
        console.log('## **Active Projects Only:**\n');
        
        const activeProjects = [
            'Arias-v-Bianchi',
            'ChittyFinance', 
            'ChiCo-Properties',
            'ChittyOS-Core',
            'IT-CAN-BE-LLC',
            'ChittyChat',
            'ChittyScore'
        ];

        activeProjects.forEach((project, index) => {
            console.log(`${index + 1}. **${project}**`);
        });
        
        console.log('\n💡 Use `/projects switch <name>` to switch projects');
    }

    async showCurrentProject() {
        const currentProjectFile = path.join(process.env.HOME, '.claude', 'current-project');
        
        if (fs.existsSync(currentProjectFile)) {
            const currentProject = fs.readFileSync(currentProjectFile, 'utf8').trim();
            console.log(`📍 **Current Project:** ${currentProject}`);
        } else {
            console.log('📍 **Current Project:** None set');
        }
        console.log('');
    }

    async showProjectStats() {
        const statsFile = path.join(process.env.HOME, '.claude', 'project-stats.json');
        
        if (fs.existsSync(statsFile)) {
            try {
                const stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
                
                console.log('## **Project Usage Statistics:**\n');
                
                const sortedProjects = Object.entries(stats)
                    .sort(([,a], [,b]) => b.tool_uses - a.tool_uses);
                
                sortedProjects.forEach(([project, data], index) => {
                    const lastUsed = data.last_used ? new Date(data.last_used).toLocaleDateString() : 'Never';
                    console.log(`${index + 1}. **${project}**`);
                    console.log(`   - Tool uses: ${data.tool_uses}`);
                    console.log(`   - Last used: ${lastUsed}`);
                    console.log(`   - Directories: ${data.directories?.length || 0}`);
                    console.log('');
                });
                
            } catch (error) {
                console.log('❌ Error reading project statistics');
            }
        } else {
            console.log('📊 No project statistics available yet');
        }
    }

    async switchProject(projectName) {
        if (!projectName) {
            console.log('❌ Please specify a project name: `/projects switch <name>`');
            return;
        }

        // Set current project
        const currentProjectFile = path.join(process.env.HOME, '.claude', 'current-project');
        fs.writeFileSync(currentProjectFile, projectName);
        
        console.log(`✅ Switched to project: **${projectName}**`);
        
        // Log the switch
        const logEntry = `${new Date().toISOString()}: Manual project switch to ${projectName} (via /projects command)\n`;
        const logFile = path.join(process.env.HOME, '.claude', 'logs', 'project-switches.log');
        fs.appendFileSync(logFile, logEntry);
        
        // Try to update ChittyChat if available
        try {
            const { ChittyChatClient } = require(path.join(this.projectAwarenessPath, 'lib', 'chittychat-client.js'));
            const client = new ChittyChatClient();
            await client.setActiveProject(projectName);
            console.log('📡 Updated ChittyChat with new project context');
        } catch (error) {
            console.log('⚠️  Could not update ChittyChat (continuing with local switch)');
        }
    }

    getStatusEmoji(status) {
        const emojis = {
            'ACTIVE': '🟢',
            'DEPLOYED': '🚀',
            'IN-PROGRESS': '🟡',
            'DEVELOPING': '🔨',
            'PLANNING': '📋',
            'AVAILABLE': '⚪',
            'INFRASTRUCTURE': '🔧'
        };
        return emojis[status] || '◯';
    }
}

// CLI execution
if (require.main === module) {
    const command = new ProjectsCommand();
    const args = process.argv.slice(2);
    command.execute(args);
}

module.exports = { ProjectsCommand };
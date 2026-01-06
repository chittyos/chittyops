#!/usr/bin/env node

/**
 * Legacy User Data Migration Script
 * Migrates nickbianchi sessions to nb and consolidates under appropriate projects
 */

const fs = require('fs');
const path = require('path');
const { ProjectAnalyzer } = require('../lib/project-analyzer.js');

class LegacyUserMigration {
    constructor() {
        this.claudePath = '/Users/nb/.claude';
        this.projectsPath = path.join(this.claudePath, 'projects');
        this.projectAnalyzer = new ProjectAnalyzer();
        this.migrationLog = [];
        
        // User mapping
        this.legacyUsers = ['nickbianchi', 'cloudeto'];
        this.targetUser = 'nb';
        
        // Project consolidation mapping
        this.projectMapping = {
            // ChittyOS Ecosystem
            'chittyfinance': 'ChittyFinance',
            'chittychat': 'ChittyChat',
            'chittyid': 'ChittyID',
            'chittychain': 'ChittyChain',
            'chittyscore': 'ChittyScore',
            'chittyos': 'ChittyOS-Core',
            'chittycanon': 'ChittyCanon',
            'chittyregistry': 'ChittyRegistry',
            
            // Legal Projects
            'arias': 'Arias-v-Bianchi',
            'legal': 'Legal-Consultant',
            
            // Business Operations
            'chico': 'ChiCo-Properties',
            'properties': 'ChiCo-Properties',
            'furnished': 'Furnished-Condos',
            'condos': 'Furnished-Condos',
            
            // Corporate Structure
            'it-can-be': 'IT-CAN-BE-LLC',
            'llc': 'IT-CAN-BE-LLC',
            'chittycorp': 'ChittyCorp',
            'foundation': 'ChittyFoundation',
            
            // Infrastructure
            'google': 'Google-Workspace-Migration',
            'workspace': 'Google-Workspace-Migration',
            'claude': 'Claude-Extensions',
            'extensions': 'Claude-Extensions'
        };
    }

    async migrate() {
        console.log('🔄 Starting legacy user data migration...');
        
        try {
            // Step 1: Analyze current project structure
            const currentProjects = await this.analyzeCurrentProjects();
            
            // Step 2: Find legacy user sessions
            const legacySessions = await this.findLegacySessions();
            
            // Step 3: Categorize sessions by project
            const categorizedSessions = await this.categorizeSessions(legacySessions);
            
            // Step 4: Create consolidated project structure
            await this.createConsolidatedStructure(categorizedSessions);
            
            // Step 5: Migrate session files
            await this.migrateSessionFiles(categorizedSessions);
            
            // Step 6: Update project statistics
            await this.updateProjectStatistics(categorizedSessions);
            
            // Step 7: Clean up legacy directories
            await this.cleanupLegacyDirectories();
            
            // Step 8: Generate migration report
            await this.generateMigrationReport(categorizedSessions);
            
            console.log('✅ Legacy user migration complete!');
            
        } catch (error) {
            console.error('❌ Migration failed:', error);
        }
    }

    async analyzeCurrentProjects() {
        console.log('📊 Analyzing current project structure...');
        
        const projects = [];
        const projectDirs = fs.readdirSync(this.projectsPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
            
        for (const dirName of projectDirs) {
            const dirPath = path.join(this.projectsPath, dirName);
            const sessionCount = fs.readdirSync(dirPath)
                .filter(file => file.endsWith('.jsonl')).length;
                
            projects.push({
                directory: dirName,
                path: dirPath,
                sessionCount,
                isLegacy: this.legacyUsers.some(user => dirName.includes(user))
            });
        }
        
        console.log(`📁 Found ${projects.length} project directories`);
        console.log(`🏷️ Legacy projects: ${projects.filter(p => p.isLegacy).length}`);
        
        return projects;
    }

    async findLegacySessions() {
        console.log('🔍 Finding legacy user sessions...');
        
        const legacySessions = [];
        const projectDirs = fs.readdirSync(this.projectsPath);
        
        for (const dirName of projectDirs) {
            const isLegacy = this.legacyUsers.some(user => dirName.includes(user));
            
            if (isLegacy) {
                const dirPath = path.join(this.projectsPath, dirName);
                const sessionFiles = fs.readdirSync(dirPath)
                    .filter(file => file.endsWith('.jsonl'))
                    .map(file => ({
                        originalProject: dirName,
                        sessionFile: file,
                        sessionPath: path.join(dirPath, file),
                        legacyUser: this.legacyUsers.find(user => dirName.includes(user))
                    }));
                    
                legacySessions.push(...sessionFiles);
            }
        }
        
        console.log(`📄 Found ${legacySessions.length} legacy sessions to migrate`);
        return legacySessions;
    }

    async categorizeSessions(legacySessions) {
        console.log('🗂️ Categorizing sessions by project...');
        
        const categorized = {
            'ChittyFinance': [],
            'ChiCo-Properties': [],
            'Arias-v-Bianchi': [],
            'ChittyID': [],
            'ChittyChain': [],
            'IT-CAN-BE-LLC': [],
            'ChittyOS-Core': [],
            'Google-Workspace-Migration': [],
            'Claude-Extensions': [],
            'ChittyChat': [],
            'ChittyScore': [],
            'ChittyCanon': [],
            'Legal-Consultant': [],
            'Furnished-Condos': [],
            'ChittyCorp': [],
            'ChittyFoundation': [],
            'Uncategorized': []
        };
        
        for (const session of legacySessions) {
            const projectName = await this.categorizeSession(session);
            
            if (categorized[projectName]) {
                categorized[projectName].push(session);
            } else {
                categorized['Uncategorized'].push(session);
            }
            
            this.migrationLog.push(`📂 ${session.originalProject} → ${projectName}`);
        }
        
        // Log categorization results
        for (const [project, sessions] of Object.entries(categorized)) {
            if (sessions.length > 0) {
                console.log(`📁 ${project}: ${sessions.length} sessions`);
            }
        }
        
        return categorized;
    }

    async categorizeSession(session) {
        const originalProject = session.originalProject.toLowerCase();
        
        // Check for direct keyword matches
        for (const [keyword, projectName] of Object.entries(this.projectMapping)) {
            if (originalProject.includes(keyword)) {
                return projectName;
            }
        }
        
        // Special case handling
        if (originalProject.includes('chico') || originalProject.includes('properties')) {
            return 'ChiCo-Properties';
        }
        
        if (originalProject.includes('arias') || originalProject.includes('bianchi')) {
            return 'Arias-v-Bianchi';
        }
        
        if (originalProject.includes('finance') || originalProject.includes('money')) {
            return 'ChittyFinance';
        }
        
        if (originalProject.includes('legal') && !originalProject.includes('arias')) {
            return 'Legal-Consultant';
        }
        
        // Analyze session content for better categorization
        try {
            const sessionContent = fs.readFileSync(session.sessionPath, 'utf8');
            const projectGuess = await this.analyzeSessionContent(sessionContent);
            if (projectGuess) {
                return projectGuess;
            }
        } catch (error) {
            // Could not read session, skip content analysis
        }
        
        return 'Uncategorized';
    }

    async analyzeSessionContent(sessionContent) {
        // Analyze session content for project keywords
        const lines = sessionContent.split('\n').filter(line => line.trim());
        const contentSample = lines.slice(0, 10).join(' ').toLowerCase();
        
        // Project keyword analysis
        if (contentSample.includes('arias') || contentSample.includes('bianchi') || contentSample.includes('court')) {
            return 'Arias-v-Bianchi';
        }
        
        if (contentSample.includes('chittyfinance') || contentSample.includes('finance') || contentSample.includes('transaction')) {
            return 'ChittyFinance';
        }
        
        if (contentSample.includes('chico') || contentSample.includes('property') || contentSample.includes('rental')) {
            return 'ChiCo-Properties';
        }
        
        if (contentSample.includes('chittyid') || contentSample.includes('identity')) {
            return 'ChittyID';
        }
        
        if (contentSample.includes('chittychain') || contentSample.includes('blockchain')) {
            return 'ChittyChain';
        }
        
        return null;
    }

    async createConsolidatedStructure(categorizedSessions) {
        console.log('🏗️ Creating consolidated project structure...');
        
        for (const [projectName, sessions] of Object.entries(categorizedSessions)) {
            if (sessions.length > 0) {
                const projectDir = path.join(this.projectsPath, projectName);
                
                if (!fs.existsSync(projectDir)) {
                    fs.mkdirSync(projectDir, { recursive: true });
                    console.log(`📁 Created project directory: ${projectName}`);
                }
            }
        }
    }

    async migrateSessionFiles(categorizedSessions) {
        console.log('📦 Migrating session files...');
        
        let migratedCount = 0;
        
        for (const [projectName, sessions] of Object.entries(categorizedSessions)) {
            const targetDir = path.join(this.projectsPath, projectName);
            
            for (const session of sessions) {
                try {
                    // Generate new filename to avoid conflicts
                    const newFileName = `migrated-${session.legacyUser}-${Date.now()}-${session.sessionFile}`;
                    const targetPath = path.join(targetDir, newFileName);
                    
                    // Copy session file
                    fs.copyFileSync(session.sessionPath, targetPath);
                    
                    // Update session metadata if possible
                    await this.updateSessionMetadata(targetPath, {
                        migratedFrom: session.originalProject,
                        legacyUser: session.legacyUser,
                        migratedAt: new Date().toISOString(),
                        consolidatedProject: projectName
                    });
                    
                    migratedCount++;
                    
                } catch (error) {
                    this.migrationLog.push(`❌ Failed to migrate ${session.sessionPath}: ${error.message}`);
                }
            }
        }
        
        console.log(`✅ Migrated ${migratedCount} session files`);
    }

    async updateSessionMetadata(sessionPath, metadata) {
        // Add migration metadata to session file if possible
        try {
            const sessionContent = fs.readFileSync(sessionPath, 'utf8');
            const lines = sessionContent.split('\n');
            
            // Add metadata as a comment at the top
            const metadataComment = `// MIGRATION_METADATA: ${JSON.stringify(metadata)}\n`;
            const updatedContent = metadataComment + sessionContent;
            
            fs.writeFileSync(sessionPath, updatedContent);
        } catch (error) {
            // Could not update metadata, continue
        }
    }

    async updateProjectStatistics(categorizedSessions) {
        console.log('📊 Updating project statistics...');
        
        const statsFile = path.join(this.claudePath, 'project-stats.json');
        let stats = {};
        
        if (fs.existsSync(statsFile)) {
            try {
                stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
            } catch (error) {
                stats = {};
            }
        }
        
        // Update stats with migrated sessions
        for (const [projectName, sessions] of Object.entries(categorizedSessions)) {
            if (sessions.length > 0) {
                if (!stats[projectName]) {
                    stats[projectName] = {
                        tool_uses: 0,
                        directories: [],
                        files: [],
                        last_used: null
                    };
                }
                
                stats[projectName].tool_uses += sessions.length;
                stats[projectName].last_used = new Date().toISOString();
                stats[projectName].migrated_sessions = sessions.length;
                stats[projectName].migration_completed = new Date().toISOString();
            }
        }
        
        fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
        console.log('📊 Project statistics updated');
    }

    async cleanupLegacyDirectories() {
        console.log('🧹 Cleaning up legacy directories...');
        
        // Create backup directory
        const backupDir = path.join(this.claudePath, 'legacy-backup');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        const projectDirs = fs.readdirSync(this.projectsPath);
        let cleanedCount = 0;
        
        for (const dirName of projectDirs) {
            const isLegacy = this.legacyUsers.some(user => dirName.includes(user));
            
            if (isLegacy) {
                const sourcePath = path.join(this.projectsPath, dirName);
                const backupPath = path.join(backupDir, dirName);
                
                try {
                    // Move to backup instead of deleting
                    fs.renameSync(sourcePath, backupPath);
                    cleanedCount++;
                    this.migrationLog.push(`🗄️ Backed up legacy directory: ${dirName}`);
                } catch (error) {
                    this.migrationLog.push(`❌ Failed to backup ${dirName}: ${error.message}`);
                }
            }
        }
        
        console.log(`🧹 Cleaned up ${cleanedCount} legacy directories`);
    }

    async generateMigrationReport(categorizedSessions) {
        const reportPath = path.join(this.claudePath, 'USER_MIGRATION_REPORT.md');
        
        const totalSessions = Object.values(categorizedSessions)
            .reduce((sum, sessions) => sum + sessions.length, 0);
        
        const report = `# Legacy User Migration Report

## 📊 Migration Summary

**Date:** ${new Date().toISOString()}
**Legacy Users Migrated:** ${this.legacyUsers.join(', ')} → ${this.targetUser}
**Total Sessions Migrated:** ${totalSessions}

## 📁 Project Consolidation

${Object.entries(categorizedSessions)
    .filter(([, sessions]) => sessions.length > 0)
    .map(([project, sessions]) => `- **${project}**: ${sessions.length} sessions`)
    .join('\n')}

## 🔄 Migration Log

${this.migrationLog.join('\n')}

## ✅ Post-Migration Actions Needed

1. **Restart Claude Code** - To refresh project awareness
2. **Run /projects stats** - To see updated statistics  
3. **Set current project** - Use /projects switch <name>
4. **Verify sessions** - Check that all sessions are accessible

## 📂 New Project Structure

All sessions are now organized under appropriate project names:
- ChittyFinance (most sessions)
- ChiCo-Properties (property management)
- Arias-v-Bianchi (legal case)
- ChittyID (identity system)
- And more...

## 🔧 Legacy Data

Legacy directories have been backed up to:
\`~/.claude/legacy-backup/\`

You can safely delete this backup after verifying migration success.

## 🚀 Next Steps

The project awareness system now has clean, consolidated data and can provide much better project suggestions and context switching!
`;

        fs.writeFileSync(reportPath, report);
        console.log(`📄 Generated migration report: ${reportPath}`);
        
        // Also log summary to console
        console.log('\n📊 MIGRATION SUMMARY:');
        console.log(`✅ Migrated ${totalSessions} sessions`);
        console.log(`📁 Consolidated into ${Object.keys(categorizedSessions).filter(k => categorizedSessions[k].length > 0).length} projects`);
        console.log(`🏷️ Legacy users: ${this.legacyUsers.join(', ')} → ${this.targetUser}`);
    }
}

// Auto-run if called directly
if (require.main === module) {
    const migration = new LegacyUserMigration();
    migration.migrate();
}

module.exports = { LegacyUserMigration };
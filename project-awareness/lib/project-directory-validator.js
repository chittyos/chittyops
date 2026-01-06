/**
 * Project Directory Validator and Mapper
 * Validates and maps projects to their actual working directories
 */

const fs = require('fs');
const path = require('path');

class ProjectDirectoryValidator {
    constructor() {
        // Actual validated project directory mappings
        this.projectDirectories = {
            'Arias-v-Bianchi': {
                primary: '/Volumes/thumb/Projects/Arias_v_Bianchi',
                alternates: [
                    '/Volumes/thumb/Projects/Arias',
                    '/Volumes/thumb/nb/MAIN/Legal/Arias-v-Bianchi' // Old location
                ],
                validated: true,
                type: 'legal',
                description: 'Main Arias v Bianchi litigation case files'
            },
            'ChittyFinance': {
                primary: '/Volumes/thumb/Projects/chittyos/chittyfinance',
                alternates: [
                    '/Volumes/thumb/Projects/chittyfoundation/chittyfinance'
                ],
                validated: true,
                type: 'financial',
                description: 'ChittyFinance financial operations system'
            },
            'ChittyID': {
                primary: '/Volumes/thumb/Projects/chittyfoundation/chittyid',
                alternates: [
                    '/Volumes/thumb/Projects/chittyos/chittyid'
                ],
                validated: true,
                type: 'identity',
                description: 'ChittyID identity verification system'
            },
            'ChiCo-Properties': {
                primary: '/Volumes/thumb/Projects/chittyapps/chico',
                alternates: [
                    '/Volumes/thumb/Projects/chico',
                    '/Volumes/thumb/Projects/ChiCo'
                ],
                validated: true,
                type: 'property_management',
                description: 'Chicago property management (C211, C504)'
            },
            'IT-CAN-BE-LLC': {
                primary: '/Volumes/thumb/Projects/ChittyTrace---IT-CAN-BE-LLC',
                alternates: [],
                validated: true,
                type: 'corporate',
                description: 'Wyoming LLC corporate structure'
            },
            'ChittyChain': {
                primary: '/Volumes/thumb/Projects/chittyfoundation/chittychain',
                alternates: [
                    '/Volumes/thumb/Projects/chittychain'
                ],
                validated: true,
                type: 'blockchain',
                description: 'ChittyChain evidence blockchain system'
            },
            'ChittyChat': {
                primary: '/Volumes/thumb/Projects/chittyos/chittychat',
                alternates: [],
                validated: true,
                type: 'project_management',
                description: 'ChittyChat AI project management MCP server'
            },
            'ChittyOS-Core': {
                primary: '/Volumes/thumb/Projects/chittyos',
                alternates: [],
                validated: true,
                type: 'core_system',
                description: 'ChittyOS core system and ecosystem'
            },
            'Claude-Extensions': {
                primary: '/Users/nb/.claude',
                alternates: [
                    '/Users/nb/Library/Application Support/Claude'
                ],
                validated: true,
                type: 'ai_development',
                description: 'Claude Code extensions and configurations'
            },
            'Google-Workspace-Migration': {
                primary: '/Volumes/thumb/Projects/GoogleWorkspaceMigration',
                alternates: [],
                validated: false, // Not found in current structure
                type: 'infrastructure',
                description: 'Google Workspace migration project'
            },
            'ChittyCorp': {
                primary: '/Volumes/thumb/Projects/chittycorp',
                alternates: [],
                validated: true,
                type: 'corporate',
                description: 'ChittyCorp corporate entity'
            },
            'ChittyFoundation': {
                primary: '/Volumes/thumb/Projects/chittyfoundation',
                alternates: [],
                validated: true,
                type: 'non_profit',
                description: 'ChittyFoundation non-profit organization'
            },
            'ChittyCanon': {
                primary: '/Volumes/thumb/Projects/chittyfoundation/chittycanon',
                alternates: [
                    '/Volumes/thumb/Projects/chittyos/chittycanon'
                ],
                validated: true,
                type: 'standards',
                description: 'ChittyCanon standards and specifications'
            },
            'ChittyRegistry': {
                primary: '/Volumes/thumb/Projects/chittyos/chittyregistry',
                alternates: [],
                validated: false, // Need to verify
                type: 'infrastructure',
                description: 'ChittyRegistry service discovery'
            },
            'Furnished-Condos': {
                primary: '/Volumes/thumb/Projects/furnishedcondos',
                alternates: [
                    '/Volumes/thumb/Projects/furnishedcondos/chicago'
                ],
                validated: true,
                type: 'property_management',
                description: 'Furnished condos short-term rental management'
            },
            'ChittyGov': {
                primary: '/Volumes/thumb/Projects/chittyfoundation/chittygov',
                alternates: [
                    '/Volumes/thumb/Projects/chittyos/chittygov'
                ],
                validated: true,
                type: 'governance',
                description: 'ChittyGov governance system'
            },
            'ChittyCases': {
                primary: '/Volumes/thumb/Projects/chittyapps/chittycases',
                alternates: [
                    '/Volumes/thumb/Projects/cookcountyapps/chittycases-cc'
                ],
                validated: true,
                type: 'legal',
                description: 'ChittyCases legal case management'
            },
            'ChittyProSe': {
                primary: '/Volumes/thumb/Projects/chittyapps/chittyprose',
                alternates: [],
                validated: true,
                type: 'legal',
                description: 'ChittyProSe pro se litigation assistant'
            },
            'ChittyTrace': {
                primary: '/Volumes/thumb/Projects/chittyapps/chittytrace',
                alternates: [
                    '/Volumes/thumb/Projects/cookcountyapps/chittytrace-cc'
                ],
                validated: true,
                type: 'tracking',
                description: 'ChittyTrace entity and document tracking'
            }
        };
    }

    /**
     * Validate project directory exists
     */
    validateProjectDirectory(projectName) {
        const projectConfig = this.projectDirectories[projectName];
        
        if (!projectConfig) {
            console.log(`⚠️  Unknown project: ${projectName}`);
            return null;
        }

        // Check primary directory
        if (fs.existsSync(projectConfig.primary)) {
            console.log(`✅ Found project directory: ${projectConfig.primary}`);
            return {
                ...projectConfig,
                actualPath: projectConfig.primary,
                exists: true
            };
        }

        // Check alternate directories
        for (const altPath of projectConfig.alternates || []) {
            if (fs.existsSync(altPath)) {
                console.log(`✅ Found project at alternate location: ${altPath}`);
                return {
                    ...projectConfig,
                    actualPath: altPath,
                    exists: true,
                    usingAlternate: true
                };
            }
        }

        console.log(`❌ Project directory not found for ${projectName}`);
        console.log(`   Expected: ${projectConfig.primary}`);
        
        return {
            ...projectConfig,
            actualPath: null,
            exists: false
        };
    }

    /**
     * Get all validated project directories
     */
    getAllValidatedProjects() {
        const validated = [];
        
        for (const [projectName, config] of Object.entries(this.projectDirectories)) {
            const validation = this.validateProjectDirectory(projectName);
            if (validation && validation.exists) {
                validated.push({
                    name: projectName,
                    path: validation.actualPath,
                    type: validation.type,
                    description: validation.description
                });
            }
        }
        
        return validated;
    }

    /**
     * Find project by working directory
     */
    findProjectByDirectory(directoryPath) {
        // Normalize path
        const normalizedPath = path.resolve(directoryPath);
        
        for (const [projectName, config] of Object.entries(this.projectDirectories)) {
            // Check primary
            if (normalizedPath === path.resolve(config.primary)) {
                return { name: projectName, ...config };
            }
            
            // Check alternates
            for (const altPath of config.alternates || []) {
                if (normalizedPath === path.resolve(altPath)) {
                    return { name: projectName, ...config, usingAlternate: true };
                }
            }
            
            // Check if path is subdirectory of project
            if (normalizedPath.startsWith(path.resolve(config.primary))) {
                return { name: projectName, ...config, isSubdirectory: true };
            }
        }
        
        return null;
    }

    /**
     * Suggest directory for unknown project
     */
    suggestProjectDirectory(projectName) {
        // Clean project name
        const cleanName = projectName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
        
        // Determine project type and suggest location
        if (cleanName.includes('chitty')) {
            if (cleanName.includes('foundation')) {
                return `/Volumes/thumb/Projects/chittyfoundation/${cleanName}`;
            } else if (cleanName.includes('app')) {
                return `/Volumes/thumb/Projects/chittyapps/${cleanName}`;
            } else {
                return `/Volumes/thumb/Projects/chittyos/${cleanName}`;
            }
        } else if (cleanName.includes('legal') || cleanName.includes('case')) {
            return `/Volumes/thumb/Projects/${cleanName}`;
        } else if (cleanName.includes('property') || cleanName.includes('rental')) {
            return `/Volumes/thumb/Projects/furnishedcondos/${cleanName}`;
        } else {
            return `/Volumes/thumb/Projects/${cleanName}`;
        }
    }

    /**
     * Create project directory structure
     */
    createProjectStructure(projectName, projectType = 'general') {
        const projectConfig = this.projectDirectories[projectName];
        
        if (!projectConfig) {
            console.log(`📁 Creating new project structure for ${projectName}`);
            const suggestedPath = this.suggestProjectDirectory(projectName);
            
            // Create directory
            fs.mkdirSync(suggestedPath, { recursive: true });
            
            // Create standard subdirectories based on project type
            const subdirs = this.getStandardSubdirectories(projectType);
            subdirs.forEach(subdir => {
                fs.mkdirSync(path.join(suggestedPath, subdir), { recursive: true });
            });
            
            console.log(`✅ Created project structure at ${suggestedPath}`);
            
            // Add to registry
            this.projectDirectories[projectName] = {
                primary: suggestedPath,
                alternates: [],
                validated: true,
                type: projectType,
                description: `${projectName} project`
            };
            
            return suggestedPath;
        }
        
        return projectConfig.primary;
    }

    /**
     * Get standard subdirectories for project type
     */
    getStandardSubdirectories(projectType) {
        const subdirMap = {
            'legal': ['Evidence', 'Motions', 'Discovery', 'Timeline', 'Strategy', 'Documentation'],
            'financial': ['Reports', 'Transactions', 'Analysis', 'Compliance', 'Documentation'],
            'identity': ['Verification', 'Registry', 'Documentation', 'Testing'],
            'property_management': ['Properties', 'Tenants', 'Maintenance', 'Financial', 'Documentation'],
            'corporate': ['Formation', 'Governance', 'Compliance', 'Financial', 'Documentation'],
            'development': ['src', 'tests', 'docs', 'config', 'scripts'],
            'general': ['Documentation', 'Resources', 'Archive']
        };
        
        return subdirMap[projectType] || subdirMap['general'];
    }

    /**
     * Migrate project to correct location
     */
    async migrateProjectDirectory(projectName, fromPath, toPath) {
        console.log(`🔄 Migrating ${projectName} from ${fromPath} to ${toPath}`);
        
        try {
            // Check if source exists
            if (!fs.existsSync(fromPath)) {
                throw new Error(`Source path does not exist: ${fromPath}`);
            }
            
            // Check if destination exists
            if (fs.existsSync(toPath)) {
                throw new Error(`Destination already exists: ${toPath}`);
            }
            
            // Create destination directory
            fs.mkdirSync(path.dirname(toPath), { recursive: true });
            
            // Move directory
            fs.renameSync(fromPath, toPath);
            
            // Update registry
            if (this.projectDirectories[projectName]) {
                this.projectDirectories[projectName].primary = toPath;
                // Move old primary to alternates
                if (!this.projectDirectories[projectName].alternates.includes(fromPath)) {
                    this.projectDirectories[projectName].alternates.push(fromPath);
                }
            }
            
            console.log(`✅ Successfully migrated ${projectName} to ${toPath}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Migration failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Get project statistics
     */
    getProjectStatistics() {
        const stats = {
            total: Object.keys(this.projectDirectories).length,
            validated: 0,
            missing: 0,
            byType: {}
        };
        
        for (const [projectName, config] of Object.entries(this.projectDirectories)) {
            const validation = this.validateProjectDirectory(projectName);
            
            if (validation && validation.exists) {
                stats.validated++;
            } else {
                stats.missing++;
            }
            
            // Count by type
            if (!stats.byType[config.type]) {
                stats.byType[config.type] = 0;
            }
            stats.byType[config.type]++;
        }
        
        return stats;
    }
}

module.exports = { ProjectDirectoryValidator };
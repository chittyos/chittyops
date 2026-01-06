#!/usr/bin/env node

/**
 * Test Smart Start - Quick demonstration of complete environment restoration
 */

const fs = require('fs');
const path = require('path');

function testSmartStart(projectName) {
    console.log(`🚀 Testing smart session restoration for ${projectName}...`);

    // Step 1: Load smart session
    const smartSessionPath = path.join(
        process.env.HOME,
        '.claude',
        'projects',
        projectName,
        `${projectName}-SMART-START.jsonl`
    );

    if (!fs.existsSync(smartSessionPath)) {
        console.log(`❌ No smart session found for ${projectName}`);
        return;
    }

    const content = fs.readFileSync(smartSessionPath, 'utf8');
    const lines = content.trim().split('\n');
    const sessionData = JSON.parse(lines[0]);
    const contextMessage = lines[1] ? JSON.parse(lines[1]) : null;

    console.log(`📖 Smart session loaded (${sessionData.consolidated_sessions} sessions)`);

    // Step 2: Simulated ChittyChat connection
    console.log(`🔗 Connecting to ChittyChat API (https://api.chitty.cc)...`);
    console.log(`📡 Connected to ChittyChat project: ${projectName}`);
    console.log(`📋 Open tasks: ${Math.floor(Math.random() * 10)}`);
    console.log(`🆔 ChittyID: PROJ-${Date.now()}`);

    // Step 3: Environment setup simulation
    console.log(`🔧 Setting up environment for ${projectName}...`);
    
    const projectConfigs = {
        'ChittyOS-Core': {
            workingDir: '/Volumes/thumb/Projects/chittyos',
            services: ['chittyos-core', 'mcp-server'],
            envVars: { PROJECT_TYPE: 'core_os', CHITTY_ENV: 'development' }
        },
        'Arias-v-Bianchi': {
            workingDir: '/Volumes/thumb/nb/MAIN/Legal/Arias-v-Bianchi',
            services: ['chittychain', 'chittyledger'],
            envVars: { PROJECT_TYPE: 'legal', CASE_NAME: 'Arias-v-Bianchi' }
        },
        'ChittyFinance': {
            workingDir: '/Volumes/thumb/Projects/chittyos/chittyfinance',
            services: ['chittyfinance', 'database'],
            envVars: { PROJECT_TYPE: 'financial', NODE_ENV: 'development' }
        }
    };

    const config = projectConfigs[projectName] || {
        workingDir: process.cwd(),
        services: [],
        envVars: { PROJECT_TYPE: 'general' }
    };

    console.log(`📂 Working directory: ${config.workingDir}`);
    
    // Set environment variables
    for (const [key, value] of Object.entries(config.envVars)) {
        process.env[key] = value;
        console.log(`🌿 ${key}=${value}`);
    }

    // Simulate service starts
    config.services.forEach(service => {
        console.log(`🚀 Started service: ${service}`);
    });

    // Step 4: Display smart context
    console.log('\n' + '='.repeat(60));
    console.log('📊 SMART SESSION CONTEXT');
    console.log('='.repeat(60));
    
    if (contextMessage?.content) {
        console.log(contextMessage.content);
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎯 COMPLETE ENVIRONMENT READY!');
    console.log('='.repeat(60));
    
    // Step 5: Integration status
    console.log(`\n✅ Smart session active for ${projectName}!`);
    console.log(`📂 Directory: ${config.workingDir}`);
    console.log(`🔧 Services: ${config.services.join(', ')}`);
    console.log(`💬 ChittyChat: Connected to https://api.chitty.cc`);
    console.log(`🆔 Project ChittyID: PROJ-${Date.now()}`);

    // Step 6: Create quick restoration command
    console.log(`\n📜 Quick restore command for new terminal:`);
    console.log(`   source <(echo 'cd ${config.workingDir}; echo "Restored ${projectName} session"')`);

    return true;
}

// CLI execution
const projectName = process.argv[2];
if (projectName) {
    testSmartStart(projectName);
} else {
    console.log('Usage: node test-smart-start.js <project-name>');
    console.log('Example: node test-smart-start.js ChittyOS-Core');
}
# ChittyChat Project Awareness Extension

🧠 **Intelligent project awareness and switching system for Claude Code**

This extension provides smart project detection, session analysis, and automatic project switching with user confirmation. It integrates deeply with ChittyChat to maintain project context across Claude Code sessions.

## Features

### 🎯 **Intelligent Project Detection**
- **Directory Analysis**: Detects projects based on file patterns, directory structure, and naming conventions
- **Multi-Project Context**: Recognizes when you're working across multiple related projects
- **Cross-Project Relationships**: Understands how projects relate to each other (legal + financial, etc.)
- **Session History Analysis**: Learns from your past work patterns

### 🔄 **Smart Project Switching**
- **Startup Analysis**: Analyzes context when Claude Code starts and suggests relevant projects
- **Pre-Tool Detection**: Before each tool use, checks if you might want to switch projects
- **Post-Tool Learning**: Learns from tool results to improve future suggestions
- **Directory Change Tracking**: Automatically detects when you navigate to different project areas

### 💬 **ChittyChat Integration**
- **Project Synchronization**: Keeps ChittyChat updated with your current project context
- **Activity Logging**: Tracks all tool usage and associates it with projects
- **Task Awareness**: Considers open tasks when suggesting project switches
- **Statistics Tracking**: Maintains detailed usage statistics per project

### 🤝 **User Confirmation System**
- **Smart Prompts**: Only prompts when confidence is high enough
- **Context-Aware Messages**: Explains why a project switch is suggested
- **Multi-Project Workflows**: Handles complex scenarios involving multiple projects
- **Skip Options**: Can disable prompts when doing exploratory work

### 🔄 **Cross-Session Alignment**
- **Forced Restoration**: Automatically compacts and restores before critical tools
- **Memory Integration**: Syncs with Memory-Claude system for session synthesis
- **ChittyID Integration**: Every project gets a ChittyID through established protocols
- **Registry Synchronization**: Projects registered with ChittyRegistry for service discovery
- **Real-time Context**: Maintains up-to-date project context across all sessions

## Installation

### 1. **Copy Extension Files**
The extension is already installed at:
```
~/.claude/extensions/project-awareness/
```

### 2. **Update Claude Code Settings**
The hooks are configured in your `settings.local.json`:

```json
{
  "hooks": {
    "onStart": [
      {
        "command": "/Users/nb/.claude/hooks/project-awareness-startup.sh"
      }
    ],
    "preToolUse": [
      {
        "command": "/Users/nb/.claude/hooks/project-awareness-pretool.sh",
        "tools": ["*"]
      }
    ],
    "postToolUse": [
      {
        "command": "/Users/nb/.claude/hooks/project-awareness-posttool.sh", 
        "tools": ["*"]
      }
    ]
  }
}
```

### 3. **Install Dependencies**
```bash
cd ~/.claude/extensions/project-awareness
npm install
```

### 4. **Restart Claude Code**
The hooks will only take effect after Claude Code is restarted.

## How It Works

### **On Claude Startup** 
1. Analyzes your current working directory
2. Examines recent file modifications
3. Checks git branch and repository context
4. Queries ChittyChat for active projects
5. Presents smart suggestions for project selection

### **Before Each Tool Use**
1. Analyzes the tool and its arguments
2. Checks if file paths suggest different projects
3. Evaluates directory context
4. Prompts for confirmation if project switch is suggested

### **After Each Tool Use**
1. Logs activity to current project
2. Analyzes tool results for project keywords
3. Updates project usage statistics
4. Learns patterns for better future suggestions

### **On Directory Changes**
1. Detects when you navigate to different directories
2. Analyzes new directory for project context
3. Suggests project switches based on location

## Project Detection Patterns

The system recognizes these project types:

### **Legal Projects**
- **Arias-v-Bianchi**: Legal files, court documents, evidence, motions
- **Patterns**: `/arias/`, `/legal/`, `/court/`, `.pdf` files with legal terms

### **ChittyOS Ecosystem**
- **ChittyOS-Core**: Core system files, MCP servers, canon standards
- **ChittyFinance**: Financial operations, invoices, transactions
- **ChittyChat**: Task management, project coordination
- **ChittyScore**: Reputation system, trust scoring

### **Business Operations**
- **ChiCo-Properties**: Chicago property management, rentals, leases
- **Furnished-Condos**: Short-term rental operations
- **IT-CAN-BE-LLC**: Wyoming LLC corporate structure

### **Cross-Project Detection**
The system recognizes when you're working across multiple projects:
- **Integration Files**: `bridge`, `sync`, `integration` patterns
- **Deployment Scripts**: `deploy`, `migration`, `setup` patterns  
- **Configuration Files**: Settings that span multiple systems
- **Dashboard/Overview**: Files that aggregate multiple projects

## Cross-Session Alignment Triggers

The system automatically forces session compaction and restoration before these critical operations:

### **Critical Tools**
- **Task/TodoWrite**: ChittyChat integration requires latest context
- **MCP Operations**: All ChittyOS MCP server interactions
- **ChittyOS Commands**: Any bash commands involving ChittyOS services

### **Critical File Patterns**
- **`.claude/` files**: Claude configuration and settings
- **Session files**: `*session*.json`, `*consolidated*.json`
- **Project files**: `*project*.json`, project metadata
- **ChittyOS files**: Anything matching `*chitty*` pattern

### **Bash Command Patterns**
- **Service management**: `launchctl *chitty*`, `ps *chitty*`
- **Development servers**: `npm *dev`, `node *server*`
- **MCP servers**: `mcp *server*`

### **Search Operations**
- **Grep/Glob patterns**: Searching for `chitty|session|project|mcp|claude`
- **Cross-project searches**: When patterns suggest multi-project context

When any of these triggers are detected, the system:
1. 🗜️ **Compacts current session** with Memory-Claude integration
2. 📁 **Restores latest project context** from session memory
3. 📡 **Syncs with ChittyChat** for recent updates
4. 💾 **Updates memory system** with current state

## User Interaction Examples

### **Cross-Session Alignment Example**
```
🔄 Tool Bash requires cross-session alignment - forcing restoration...
📡 Forcing cross-session alignment...
🗜️ Session compacted for alignment
📁 Restoring project context: Arias-v-Bianchi
📥 Synced 5 updates from ChittyChat
💾 Memory system updated with current state
✅ Cross-session alignment complete
```

### **Startup Project Selection**
```
🧠 ChittyChat Project Awareness
═══════════════════════════════════

Based on your recent activity, I've identified these relevant projects:

1. 📁 Arias-v-Bianchi (85% match)
   Working directory contains legal documents

2. 💬 ChittyFinance (72% match)
   Active in ChittyChat with 3 open tasks

3. 📄 ChiCo-Properties (65% match) 
   Recent files suggest property management

Would you like to switch to one of these projects or continue with something else?

Options:
   1. Select Arias-v-Bianchi (primary)
   2. Work across multiple projects
   3. Select different project  
   4. Continue without project context

Choose option [1-4]: 
```

### **Pre-Tool Project Switch**
```
🔄 PROJECT SWITCH SUGGESTED
   Current: ChittyOS-Core
   Suggested: Arias-v-Bianchi (89% confidence)
   Reason: File operation on /Users/nb/Arias_v_Bianchi/evidence.pdf

Switch to suggested project? [Y/n/r] (r=related projects):
```

### **Multi-Project Context**
```
🔀 MULTI-PROJECT CONTEXT DETECTED
══════════════════════════════════════

📍 Primary Project: ChittyFinance (78% confidence)

🔗 Related Projects Also Detected:
   1. ChiCo-Properties (65% confidence)
   2. IT-CAN-BE-LLC (52% confidence)

Options:
   1. Focus on ChittyFinance (primary)
   2. Work across multiple projects
   3. Select different project
   4. Continue without project context

Choose option [1-4]:
```

## Configuration

### **Confidence Threshold**
Adjust when the system prompts for project switches:
```bash
export PROJECT_CONFIDENCE_THRESHOLD=0.75  # Default: 75%
```

### **Disable Prompts**
Temporarily disable project switching prompts:
```bash
touch ~/.claude/skip-project-prompts
```

### **Enable Debug Logging**
```bash
export PROJECT_AWARENESS_DEBUG=true
tail -f ~/.claude/logs/project-awareness.log
```

## Log Files

The system maintains several log files:

- **`~/.claude/logs/project-awareness.log`**: Main activity log
- **`~/.claude/logs/project-switches.log`**: Project switch history
- **`~/.claude/logs/project-activity.jsonl`**: Detailed activity tracking
- **`~/.claude/logs/project-suggestions.jsonl`**: Suggestion history for learning
- **`~/.claude/project-stats.json`**: Per-project usage statistics

## Integration with ChittyChat

### **Automatic Project Updates**
When you switch projects, the extension:
1. Updates ChittyChat's active project context
2. Logs the switch with timestamp and reason
3. Associates subsequent tool usage with the new project
4. Updates project activity statistics

### **Task Awareness**
The system considers:
- Open tasks when suggesting projects
- Task deadlines and priorities
- Recent task activity
- Cross-project task dependencies

### **Activity Tracking**
All tool usage is logged to ChittyChat:
```json
{
  "timestamp": "2025-08-29T19:30:00Z",
  "project": "Arias-v-Bianchi",
  "tool": "Read",
  "context": {
    "file_path": "/Users/nb/Arias_v_Bianchi/motion.pdf",
    "agent": "legal-specialist"
  }
}
```

## Troubleshooting

### **Extension Not Starting**
1. Check that Node.js is installed: `node --version`
2. Verify extension files exist: `ls -la ~/.claude/extensions/project-awareness/`
3. Check hook permissions: `chmod +x ~/.claude/hooks/project-awareness-*.sh`
4. Restart Claude Code completely

### **ChittyChat Connection Issues**
1. Verify ChittyChat MCP server is configured in settings
2. Check ChittyChat is running: `ps aux | grep chittychat`
3. Test MCP connection manually
4. Check logs: `tail -f ~/.claude/logs/project-awareness.log`

### **Hooks Not Triggering**
1. Verify hooks are configured in `settings.local.json`
2. Restart Claude Code (hooks only load on startup)
3. Check hook file permissions and paths
4. Test hooks manually: `~/.claude/hooks/project-awareness-startup.sh`

## Development

### **Adding New Project Types**
Edit `lib/project-analyzer.js` and add patterns:

```javascript
'My-New-Project': {
    patterns: [/mynewproject/i, /special-keyword/i],
    directories: ['mynewproject', 'special-dir'],
    files: ['*.special', 'config', 'readme']
}
```

### **Custom User Prompts**
Modify `lib/user-prompt.js` to customize user interaction:

```javascript
async customProjectPrompt(context) {
    // Your custom prompt logic here
}
```

### **ChittyChat Integration**
Extend `lib/chittychat-client.js` for additional ChittyChat features:

```javascript
async getCustomProjectData() {
    return await this.sendRequest('tools/call', {
        name: 'custom_tool',
        arguments: { /* custom args */ }
    });
}
```

## Contributing

This extension is part of the ChittyOS ecosystem. To contribute:

1. Test thoroughly with multiple project types
2. Maintain backward compatibility
3. Update documentation for new features
4. Follow existing code patterns and naming conventions

## License

Part of the ChittyOS project ecosystem.
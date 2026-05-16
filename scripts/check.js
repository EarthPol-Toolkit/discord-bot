const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

process.env.CHECK_COMMANDS = '1';
require('dotenv').config();

const root = path.join(__dirname, '..');
const jsFiles = [];

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        if (entry.isFile() && entry.name.endsWith('.js')) jsFiles.push(full);
    }
}

walk(root);

for (const file of jsFiles) {
    const result = spawnSync(process.execPath, ['--check', file], {
        cwd: root,
        encoding: 'utf8'
    });
    if (result.status !== 0) {
        process.stderr.write(result.stderr || result.stdout);
        process.exit(result.status || 1);
    }
}

const commandsDir = path.join(root, 'bot/components/slashcommands');
const commands = fs.readdirSync(commandsDir)
    .filter(file => file.endsWith('.js'))
    .map(file => {
        const command = require(path.join(commandsDir, file));
        if (!command.data || typeof command.execute !== 'function') {
            throw new Error(`${file} must export data and execute`);
        }
        const json = command.data.toJSON();
        if (!json.name || !json.description) {
            throw new Error(`${file} has invalid slash command metadata`);
        }
        return json.name;
    });

const duplicate = commands.find((name, index) => commands.indexOf(name) !== index);
if (duplicate) {
    throw new Error(`Duplicate slash command: ${duplicate}`);
}

console.log(`Checked ${jsFiles.length} JavaScript files and ${commands.length} slash commands.`);

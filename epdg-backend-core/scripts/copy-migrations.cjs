'use strict';

const { cpSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const source = join(__dirname, '..', 'src', 'db', 'migrations');
const destination = join(__dirname, '..', 'dist', 'db', 'migrations');

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true, force: true });

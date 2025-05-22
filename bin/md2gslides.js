#!/usr/bin/env node

// Copyright 2016 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* eslint-disable no-console, @typescript-eslint/no-var-requires */

// babel-polyfill is no longer needed with modern Node.js

const Promise = require('promise');
const fs = require('fs');
const path = require('path');
const ArgumentParser = require('argparse').ArgumentParser;
const UserAuthorizer = require('../lib/auth').default;
const SlideGenerator = require('../lib/slide_generator').default;
const opener = require('opener');
const readline = require('readline');

const SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive',
];

const USER_HOME =
  process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
const STORED_CREDENTIALS_PATH = path.join(
  USER_HOME,
  '.md2googleslides',
  'credentials.json'
);
const STORED_CLIENT_ID_PATH = path.join(
  USER_HOME,
  '.md2googleslides',
  'client_id.json'
);

const parser = new ArgumentParser({
  version: '1.0.0',
  addHelp: true,
  description: 'Markdown to Slides converter',
});

parser.addArgument('file', {
  help: 'Path to markdown file to convert, If omitted, reads from stdin',
  nargs: '?',
});
parser.addArgument(['-u', '--user'], {
  help: 'Email address of user',
  required: false,
  dest: 'user',
  defaultValue: 'default',
});
parser.addArgument(['-a', '--append'], {
  dest: 'id',
  help: 'Appends slides to an existing presentation',
  required: false,
});
parser.addArgument(['-e', '--erase'], {
  dest: 'erase',
  action: 'storeTrue',
  help: 'Erase existing slides prior to appending.',
  required: false,
});
parser.addArgument(['-n', '--no-browser'], {
  action: 'storeTrue',
  dest: 'headless',
  help: 'Headless mode - do not launch browsers, just shows URLs',
  required: false,
});
parser.addArgument(['-s', '--style'], {
  help: 'Name of highlight.js theme for code formatting',
  dest: 'style',
  required: false,
  defaultValue: 'default',
});
parser.addArgument(['-t', '--title'], {
  help: 'Title of the presentation',
  dest: 'title',
  required: false,
});
parser.addArgument(['-c', '--copy'], {
  help: 'Id of the presentation to copy and use as a base',
  dest: 'copy',
  required: false,
});
parser.addArgument(['--use-fileio'], {
  help: 'Acknolwedge local and generated images are uploaded to https://file.io',
  action: 'storeTrue',
  dest: 'useFileio',
  required: false,
});
parser.addArgument(['--debug'], {
  help: 'Enable debug logging',
  action: 'storeTrue',
  dest: 'debug',
  required: false,
});

const args = parser.parseArgs();

// Enable debug logging if requested
if (args.debug) {
  process.env.DEBUG = 'md2gslides';
}

function handleError(err) {
  console.log('Unable to generate slides:', err);
}

function prompt(url) {
  if (args.headless) {
    console.log('Authorize this app by visiting this url: ');
    console.log(url);
  } else {
    console.log('Authorize this app in your browser.');
    opener(url);
  }
  console.log('\nAfter authorization, you can either:');
  console.log('- Paste the complete callback URL (e.g., http://localhost:3000/oauth/callback?code=...)');
  console.log('- Or just paste the authorization code from the URL');
  
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('\nEnter the callback URL or authorization code: ', input => {
      rl.close();
      input = input.trim();
      if (input.length > 0) {
        resolve(input);
      } else {
        reject(new Error('No authorization code or URL provided'));
      }
    });
  });
}

function authorizeUser() {
  // Load and parse client ID and secret from client_id.json file.
  let data;
  try {
    data = fs.readFileSync(STORED_CLIENT_ID_PATH);
  } catch (err) {
    console.log('Error loading client secret file:', err);
    throw err;
  }
  if (data === undefined) {
    console.log('Error loading client secret data');
    throw 'No client secret found.';
  }
  
  const credsJson = JSON.parse(data);
  
  // Detect client type and configure accordingly
  let creds, redirectUri, clientType;
  
  if (credsJson.web) {
    // Web application client
    creds = credsJson.web;
    clientType = 'web';
    
    if (creds.redirect_uris && creds.redirect_uris.length > 0) {
      redirectUri = creds.redirect_uris[0];
      console.log(`INFO: Using web client with redirect URI: ${redirectUri}`);
      console.log('Make sure this redirect URI is configured in your Google Cloud Console.');
      console.log('After authorization, copy the "code" parameter from the redirect URL.');
    } else {
      console.log('ERROR: Web client requires redirect_uris in client_id.json');
      throw new Error('Web client missing redirect_uris');
    }
  } else if (credsJson.installed) {
    // Desktop/installed application client  
    creds = credsJson.installed;
    clientType = 'installed';
    redirectUri = 'urn:ietf:wg:oauth:2.0:oob'; // Use OOB for installed apps
    console.log('INFO: Using installed/desktop client with Out-of-Band (OOB) flow');
  } else {
    console.log('ERROR: client_id.json must contain either "web" or "installed" client configuration');
    throw new Error('Invalid client_id.json format');
  }

  if (!creds || !creds.client_id || !creds.client_secret) {
    console.log('ERROR: Missing client_id or client_secret in configuration');
    throw new Error('Invalid client credentials');
  }

  console.log(`Using ${clientType} OAuth client type`);

  const options = {
    clientId: creds.client_id,
    clientSecret: creds.client_secret,
    filePath: STORED_CREDENTIALS_PATH,
    redirectUri: redirectUri, // Pass the redirect URI
    prompt: prompt,
  };
  const auth = new UserAuthorizer(options);
  return auth.getUserCredentials(args.user, SCOPES);
}

function buildSlideGenerator(oauth2Client) {
  const title = args.title || args.file;
  const presentationId = args.id;
  const copyId = args.copy;

  if (presentationId) {
    return SlideGenerator.forPresentation(oauth2Client, presentationId);
  } else if (copyId) {
    return SlideGenerator.copyPresentation(oauth2Client, title, copyId);
  } else {
    return SlideGenerator.newPresentation(oauth2Client, title);
  }
}

function eraseIfNeeded(slideGenerator) {
  if (args.erase || !args.id) {
    return slideGenerator.erase().then(() => {
      return slideGenerator;
    });
  } else {
    return Promise.resolve(slideGenerator);
  }
}

function loadCss(theme) {
  const cssPath = path.join(
    require.resolve('highlight.js'),
    '..',
    '..',
    'styles',
    theme + '.css'
  );
  const css = fs.readFileSync(cssPath, {encoding: 'UTF-8'});
  return css;
}

function generateSlides(slideGenerator) {
  let source;
  if (args.file) {
    source = path.resolve(args.file);
    // Set working directory relative to markdown file
    process.chdir(path.dirname(source));
  } else {
    source = 0;
  }
  const input = fs.readFileSync(source, {encoding: 'UTF-8'});
  const css = loadCss(args.style);

  return slideGenerator.generateFromMarkdown(input, {
    css: css,
    useFileio: args.useFileio,
  });
}

function displayResults(id) {
  const url = 'https://docs.google.com/presentation/d/' + id;
  if (args.headless) {
    console.log('View your presentation at: %s', url);
  } else {
    console.log('Opening your presentation (%s)', url);
    opener(url);
  }
}
authorizeUser()
  .then(buildSlideGenerator)
  .then(eraseIfNeeded)
  .then(generateSlides)
  .then(displayResults)
  .catch(handleError);

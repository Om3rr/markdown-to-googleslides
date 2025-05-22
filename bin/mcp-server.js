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

const fs = require('fs');
const path = require('path');
const UserAuthorizer = require('../lib/auth').default;
const SlideGenerator = require('../lib/slide_generator').default;

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

class MCPServer {
  constructor() {
    this.tools = [
      {
        name: 'create-google-slides',
        description: 'Create a Google Slides presentation from markdown content',
        inputSchema: {
          type: 'object',
          properties: {
            markdown: {
              type: 'string',
              description: 'Markdown content to convert to slides'
            },
            title: {
              type: 'string',
              description: 'Title of the presentation (optional)'
            },
            style: {
              type: 'string',
              description: 'Highlight.js theme for code formatting (default: "default")',
              default: 'default'
            },
            useFileio: {
              type: 'boolean',
              description: 'Allow uploading local/generated images to file.io (optional)',
              default: false
            }
          },
          required: ['markdown']
        }
      },
      {
        name: 'append-to-slides',
        description: 'Append markdown content to an existing Google Slides presentation',
        inputSchema: {
          type: 'object',
          properties: {
            presentationId: {
              type: 'string',
              description: 'ID of the existing presentation to append to'
            },
            markdown: {
              type: 'string',
              description: 'Markdown content to convert and append as slides'
            },
            style: {
              type: 'string',
              description: 'Highlight.js theme for code formatting (default: "default")',
              default: 'default'
            },
            erase: {
              type: 'boolean',
              description: 'Erase existing slides before appending (optional)',
              default: false
            },
            useFileio: {
              type: 'boolean',
              description: 'Allow uploading local/generated images to file.io (optional)',
              default: false
            }
          },
          required: ['presentationId', 'markdown']
        }
      },
      {
        name: 'copy-and-create-slides',
        description: 'Copy an existing presentation and create new slides from markdown',
        inputSchema: {
          type: 'object',
          properties: {
            copyFromId: {
              type: 'string',
              description: 'ID of the presentation to copy as a base'
            },
            markdown: {
              type: 'string',
              description: 'Markdown content to convert to slides'
            },
            title: {
              type: 'string',
              description: 'Title of the new presentation (optional)'
            },
            style: {
              type: 'string',
              description: 'Highlight.js theme for code formatting (default: "default")',
              default: 'default'
            },
            useFileio: {
              type: 'boolean',
              description: 'Allow uploading local/generated images to file.io (optional)',
              default: false
            }
          },
          required: ['copyFromId', 'markdown']
        }
      }
    ];
  }

  async authorizeUser() {
    // Load and parse client ID and secret from client_id.json file.
    let data;
    try {
      data = fs.readFileSync(STORED_CLIENT_ID_PATH);
    } catch (err) {
      throw new Error(`Error loading client secret file: ${err.message}`);
    }
    
    const credsJson = JSON.parse(data);
    
    // Detect client type and configure accordingly
    let creds, redirectUri, clientType;
    
    if (credsJson.web) {
      creds = credsJson.web;
      clientType = 'web';
      redirectUri = creds.redirect_uris?.[0];
      if (!redirectUri) {
        throw new Error('Web client requires redirect_uris in client_id.json');
      }
    } else if (credsJson.installed) {
      creds = credsJson.installed;
      clientType = 'installed';
      redirectUri = 'urn:ietf:wg:oauth:2.0:oob';
    } else {
      throw new Error('client_id.json must contain either "web" or "installed" client configuration');
    }

    if (!creds?.client_id || !creds?.client_secret) {
      throw new Error('Missing client_id or client_secret in configuration');
    }

    const options = {
      clientId: creds.client_id,
      clientSecret: creds.client_secret,
      filePath: STORED_CREDENTIALS_PATH,
      redirectUri: redirectUri,
      prompt: async (url) => {
        throw new Error(`Authentication required. Please visit: ${url}\nThen run the CLI tool first to authenticate.`);
      },
    };
    
    const auth = new UserAuthorizer(options);
    return auth.getUserCredentials('default', SCOPES);
  }

  loadCss(theme = 'default') {
    try {
      const cssPath = path.join(
        require.resolve('highlight.js'),
        '..',
        '..',
        'styles',
        theme + '.css'
      );
      return fs.readFileSync(cssPath, {encoding: 'UTF-8'});
    } catch (err) {
      // Fallback to default theme if requested theme not found
      const cssPath = path.join(
        require.resolve('highlight.js'),
        '..',
        '..',
        'styles',
        'default.css'
      );
      return fs.readFileSync(cssPath, {encoding: 'UTF-8'});
    }
  }

  async buildSlideGenerator(oauth2Client, { title, presentationId, copyFromId }) {
    if (presentationId) {
      return SlideGenerator.forPresentation(oauth2Client, presentationId);
    } else if (copyFromId) {
      return SlideGenerator.copyPresentation(oauth2Client, title, copyFromId);
    } else {
      return SlideGenerator.newPresentation(oauth2Client, title);
    }
  }

  async handleTool(toolName, parameters) {
    try {
      const oauth2Client = await this.authorizeUser();
      
      switch (toolName) {
        case 'create-google-slides':
          return await this.createSlides(oauth2Client, parameters);
        case 'append-to-slides':
          return await this.appendToSlides(oauth2Client, parameters);
        case 'copy-and-create-slides':
          return await this.copyAndCreateSlides(oauth2Client, parameters);
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  }

  async createSlides(oauth2Client, { markdown, title = 'Generated Presentation', style = 'default', useFileio = false }) {
    const slideGenerator = await this.buildSlideGenerator(oauth2Client, { title });
    await slideGenerator.erase(); // Always erase for new presentations
    
    const css = this.loadCss(style);
    const presentationId = await slideGenerator.generateFromMarkdown(markdown, {
      css: css,
      useFileio: useFileio,
    });

    const url = `https://docs.google.com/presentation/d/${presentationId}`;
    
    return {
      content: [{
        type: 'text',
        text: `✅ Successfully created Google Slides presentation!\n\n📊 **Presentation Details:**\n- **Title:** ${title}\n- **ID:** ${presentationId}\n- **URL:** ${url}\n- **Style:** ${style}\n- **File.io enabled:** ${useFileio ? 'Yes' : 'No'}\n\n🔗 You can view and edit your presentation at: ${url}`
      }]
    };
  }

  async appendToSlides(oauth2Client, { presentationId, markdown, style = 'default', erase = false, useFileio = false }) {
    const slideGenerator = await this.buildSlideGenerator(oauth2Client, { presentationId });
    
    if (erase) {
      await slideGenerator.erase();
    }
    
    const css = this.loadCss(style);
    const resultId = await slideGenerator.generateFromMarkdown(markdown, {
      css: css,
      useFileio: useFileio,
    });

    const url = `https://docs.google.com/presentation/d/${resultId}`;
    
    return {
      content: [{
        type: 'text',
        text: `✅ Successfully ${erase ? 'replaced' : 'appended'} slides!\n\n📊 **Presentation Details:**\n- **ID:** ${resultId}\n- **URL:** ${url}\n- **Style:** ${style}\n- **Erased existing:** ${erase ? 'Yes' : 'No'}\n- **File.io enabled:** ${useFileio ? 'Yes' : 'No'}\n\n🔗 You can view and edit your presentation at: ${url}`
      }]
    };
  }

  async copyAndCreateSlides(oauth2Client, { copyFromId, markdown, title = 'Copy of Presentation', style = 'default', useFileio = false }) {
    const slideGenerator = await this.buildSlideGenerator(oauth2Client, { title, copyFromId });
    await slideGenerator.erase(); // Erase the copied content to replace with new
    
    const css = this.loadCss(style);
    const presentationId = await slideGenerator.generateFromMarkdown(markdown, {
      css: css,
      useFileio: useFileio,
    });

    const url = `https://docs.google.com/presentation/d/${presentationId}`;
    
    return {
      content: [{
        type: 'text',
        text: `✅ Successfully created presentation from copy!\n\n📊 **Presentation Details:**\n- **Title:** ${title}\n- **ID:** ${presentationId}\n- **Copied from:** ${copyFromId}\n- **URL:** ${url}\n- **Style:** ${style}\n- **File.io enabled:** ${useFileio ? 'Yes' : 'No'}\n\n🔗 You can view and edit your presentation at: ${url}`
      }]
    };
  }

  async run() {
    const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
    const {
      ListToolsRequestSchema,
      CallToolRequestSchema
    } = require('@modelcontextprotocol/sdk/types.js');
    
    const server = new Server({
      name: 'md2googleslides-mcp',
      version: '1.0.0',
    }, {
      capabilities: {
        tools: {},
      },
    });

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return await this.handleTool(name, args);
    });

    const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

// Start the MCP server
if (require.main === module) {
  const server = new MCPServer();
  server.run().catch(console.error);
}

module.exports = MCPServer; 
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

import Debug from 'debug';
import {OAuth2Client, Credentials} from 'google-auth-library';
import path from 'path';
import mkdirp from 'mkdirp';

const debug = Debug('md2gslides');

export type UserPrompt = (message: string) => Promise<string>;

export interface AuthOptions {
  clientId: string;
  clientSecret: string;
  prompt: UserPrompt;
  filePath?: string;
  redirectUri?: string;
}

interface DatabaseSchema {
  [user: string]: Credentials;
}

/**
 * Simplified OAuth authorizer using the most basic flow.
 */
export default class UserAuthorizer {
  private db: any; // Dynamic import of Low<DatabaseSchema>
  private clientId: string;
  private clientSecret: string;
  private prompt: UserPrompt;
  private redirectUri: string;
  private filePath?: string;

  public constructor(options: AuthOptions) {
    this.db = null; // Will be initialized lazily
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.prompt = options.prompt;
    this.redirectUri = options.redirectUri || 'urn:ietf:wg:oauth:2.0:oob';
    this.filePath = options?.filePath;
  }
  
  private async initDb() {
    if (!this.db) {
      this.db = await UserAuthorizer.initDbSync(this.filePath);
    }
    return this.db;
  }

  /**
   * Extracts authorization code from either a full callback URL or just the code itself
   * @param userInput - Either a full URL or just the authorization code
   * @returns The authorization code
   */
  private extractAuthorizationCode(userInput: string): string {
    const trimmedInput = userInput.trim();
    
    // Check if it looks like a URL
    if (trimmedInput.startsWith('http://') || trimmedInput.startsWith('https://')) {
      try {
        const url = new URL(trimmedInput);
        const code = url.searchParams.get('code');
        
        if (!code) {
          throw new Error('No "code" parameter found in the URL. Please ensure you copied the complete callback URL.');
        }
        
        // URL decode the authorization code
        const decodedCode = decodeURIComponent(code);
        debug('Extracted and decoded authorization code from URL');
        debug(`Original code: ${code}`);
        debug(`Decoded code: ${decodedCode}`);
        return decodedCode;
      } catch (error) {
        if (error instanceof TypeError) {
          // Invalid URL format
          throw new Error('Invalid URL format. Please provide either the complete callback URL or just the authorization code.');
        }
        throw error;
      }
    }
    
    // If it doesn't look like a URL, assume it's just the code
    if (trimmedInput.length === 0) {
      throw new Error('No authorization code provided.');
    }
    
    // Try to URL decode the code in case it was copy-pasted with encoding
    try {
      const decodedCode = decodeURIComponent(trimmedInput);
      debug('Using input as authorization code directly');
      debug(`Original input: ${trimmedInput}`);
      debug(`Decoded code: ${decodedCode}`);
      return decodedCode;
    } catch (error) {
      // If decoding fails, use the original input
      debug('Failed to decode input, using as-is');
      return trimmedInput;
    }
  }

  public async getUserCredentials(
    user: string,
    scopes: string
  ): Promise<OAuth2Client> {
    // Use configurable redirect URI
    const oauth2Client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    // Ensure db is initialized
    const db = await this.initDb();
    await db.read();

    // Check for existing tokens
    const tokens = db.data[user];
    if (tokens) {
      debug('Using existing tokens');
      oauth2Client.setCredentials(tokens);
      try {
        await oauth2Client.getAccessToken();
        return oauth2Client;
      } catch (error) {
        debug('Existing tokens invalid, need new authorization');
        // Continue to get new tokens
      }
    }

    // Get new authorization
    debug('Getting new authorization');
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'online',
      scope: scopes,
    });

    const userInput = await this.prompt(authUrl);
    const code = this.extractAuthorizationCode(userInput);
    
    debug(`Attempting token exchange with code length: ${code.length}`);
    debug(`Redirect URI: ${this.redirectUri}`);
    
    try {
      const tokenResponse = await oauth2Client.getToken(code);
      
      // Save tokens
      oauth2Client.setCredentials(tokenResponse.tokens);
      db.data[user] = tokenResponse.tokens;
      await db.write();
      
      return oauth2Client;
    } catch (error: unknown) {
      debug('Token exchange failed');
      debug(`Error details: ${error instanceof Error ? error.message : String(error)}`);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('invalid_grant') || errorMessage.includes('Malformed auth code')) {
        throw new Error(
          `Authorization code is invalid or malformed. This can happen if:\n` +
          `- The code has expired (codes are only valid for ~10 minutes)\n` +
          `- The redirect URI doesn't match your OAuth client configuration\n` +
          `- The code was corrupted during copy/paste\n` +
          `\nPlease try the authorization process again with a fresh authorization URL.`
        );
      }
      
      throw error;
    }
  }

  private static async initDbSync<T extends DatabaseSchema>(filePath?: string): Promise<any> {
    const { Low } = await import('lowdb');
    const { JSONFile } = await import('lowdb/node');
    
    if (filePath) {
      const parentDir = path.dirname(filePath);
      mkdirp.sync(parentDir);
      const adapter = new JSONFile<T>(filePath);
      const db = new Low<T>(adapter, {} as T);
      return db;
    } else {
      // For in-memory, we still need a minimal adapter-like structure
      const db = new Low<T>(new JSONFile<T>(''), {} as T);
      return db;
    }
  }
}

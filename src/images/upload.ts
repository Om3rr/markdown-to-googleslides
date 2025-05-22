// Copyright 2019 Google Inc.
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
import fs from 'fs';
import path from 'path';

const debug = Debug('md2gslides');

/**
 * Uploads a local file to temporary storage so it is HTTP/S accessible.
 *
 * Currently uses https://file.io for free emphemeral file hosting.
 *
 * @param {string} filePath -- Local path to image to upload
 * @returns {Promise<string>} URL to hosted image
 */
async function uploadLocalImage(filePath: string): Promise<string> {
  debug('Registering file %s', filePath);
  
  try {
    // Read file as buffer
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    
    // Create FormData with Blob for better Node.js compatibility
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { 
      type: 'application/octet-stream' 
    });
    formData.append('file', blob, fileName);

    debug('Uploading file to file.io...');
    const response = await fetch('https://file.io', {
      method: 'POST',
      body: formData,
    });

    debug('Response status: %d', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      debug('HTTP error response: %s', errorText);
      throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    debug('Response content-type: %s', contentType);
    
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await response.text();
      debug('Non-JSON response received: %s', responseText.substring(0, 200));
      throw new Error(`Expected JSON response but got ${contentType}. Response: ${responseText.substring(0, 200)}`);
    }

    const responseData = await response.json();
    debug('Upload response: %O', responseData);
    
    if (!responseData.success) {
      debug('Upload failed: %O', responseData);
      throw new Error(`Upload failed: ${responseData.message || JSON.stringify(responseData)}`);
    }
    
    if (!responseData.link) {
      throw new Error('No download link in response');
    }
    
    debug('Temporary link: %s', responseData.link);
    return responseData.link;
  } catch (error) {
    debug('Error uploading file: %O', error);
    // Re-throw with more context
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to upload ${filePath}: ${errorMessage}`);
  }
}

export default uploadLocalImage;

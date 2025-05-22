# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2025-01-22

### Added
- Basic example presentation (`examples/basic-presentation.md`) demonstrating tool capabilities
- URL parsing support in authentication flow - users can now paste complete callback URLs
- Better error messages for authentication issues with troubleshooting guidance
- Debug flag (`--debug`) for troubleshooting authentication problems
- Improved CLI prompts with clearer instructions for OAuth flow

### Fixed
- ESM module compatibility issues with lowdb v7 - fixed dynamic imports in compiled JavaScript
- Authentication flow now properly handles both full callback URLs and authorization codes
- Updated Babel configuration to target Node.js 18+ and preserve dynamic imports

### Changed
- Updated target Node.js version from 8 to 18 for better ESM support
- Improved error handling in OAuth2 token exchange with specific error messages
- Enhanced debugging output for authentication troubleshooting

## [1.0.0] - 2025-01-21

### Added
- Initial release of modernized md2googleslides
- Model Context Protocol (MCP) server functionality
- Support for npx usage without installation
- Updated dependencies for Node.js 22+ compatibility
- Comprehensive README with setup instructions
- Dual binary support for CLI and MCP server modes

## 0.5 

* Change handling of STDIN from command line. File arg is now optional, reads from stdin when omitted
* Support local image upload (via file.io) and rasterization of SVG and TeX/MathML expressions
* Fix image alignment when included in a column
* Allow offsets for images
* Allow custom layouts via markdown, copying from existing template. Note
  this changes the drive scope and requires reauthorization.
* Update dependencies
* Migrate code to TypeScript

## 0.4

* Allow piping markdown from stdin
* Update dependencies
* Allow CSS attributes on most markdown blocks

## 0.3

* Allow blank slides

## 0.2

* Add support for additional text styles including strikethrough,
  underline, superscript, small caps, color, and subscript
* Add support for subset of inline HTML elements for styling
* Fix bug with hard vs. soft breaks.

## 0.1.1

* Fix API version used in tests to v1

## 0.1

* Initial release

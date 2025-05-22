# Welcome to md2googleslides

A simple tool to convert Markdown to Google Slides

---

# Getting Started

## Installation

```bash
npx markdown-to-googleslides slides.md --title "My Presentation"
```

## Features
- Easy markdown syntax
- Code highlighting
- Images and videos
- Multiple layouts

---

# Slide Layouts

Different layouts are automatically detected based on content structure

---

# Title & Body Example

This slide demonstrates the title and body layout.

You can include:
* **Bold text**
* *Italic text*
* `Code snippets`
* [Links](https://github.com)

---

# Code Highlighting

```javascript
// JavaScript example
function greet(name) {
  console.log(`Hello, ${name}!`);
}

greet('World');
```

---

# Lists and Structure

## Ordered Lists
1. First item
2. Second item
3. Third item

## Unordered Lists
- Bullet point one
- Bullet point two
  - Nested bullet
  - Another nested bullet

---

# Two Column Layout

This is the left column content. It can contain any markdown elements.

{.column}

This is the right column content. The `{.column}` marker separates the columns.

---

# Big Point {.big}

Use `{.big}` for emphasis slides

---

# Images

![Example Image](https://via.placeholder.com/600x400/4285f4/ffffff?text=md2googleslides)

---

# Thank You! 

Questions? Visit our [GitHub repository](https://github.com/googleworkspace/md2googleslides)

<!-- 
Speaker notes: This is a basic example of what md2googleslides can do.
You can add speaker notes using HTML comments like this.
--> 
# Outliner Card View Plugin

Hey there! Welcome to the **Outliner Card View Plugin**. This Obsidian plugin is here to make your note-taking life a bit easier. With just a click or a hotkey, you can copy or save exactly what you see in your editor to the clipboard or do a file explort, including block reference text. Whether you're sharing content with an LLM (ChatGPT, Grok, Gemini), sending the note to someone else, or just saving your notes in text any app can read, this plugin has got you covered with easy-to-use buttons and hotkey commands.

## What Is It?

Think of it as a handy tool that lets you copy or save your obsidian styled markdown content with minimal effort. The key value here is how it resolves embedded text for you. The Outliner Card View Plugin adds some convenient buttons and commands to your Obsidian workspace to help you get things done quickly.

## Features

- 📝 **Copy to Clipboard:** Quickly copy the content of your active editor to the clipboard with a customizable button or a hotkey (Cmd/Ctrl+Shift+C).
- 💾 **Save to File:** Save the content of your active editor to a file with a customizable button or a hotkey (Cmd/Ctrl+Shift+S).
- 📍 **Customizable Button Positions:** Choose where to display the copy and save buttons—options include ribbon, hidden, and various floating positions.

## Settings

You can customize the Outliner Card View Plugin to perfectly match your workflow in the Obsidian settings tab under "Outliner Card View Plugin". Here's a quick overview of the available settings:

- **Content Settings:**
  - Remove Metadata: Toggle to remove metadata (front matter) from the copied content. Since usually we don't want to send this out.
  - Remove Block IDs: Toggle to remove block reference IDs from the copied content. Since these are usually only recognized by obsidian.
- **Button Settings:**
  - Copy Button Position: Choose where to display the copy button (ribbon, hidden, floating positions).
  - Save Button Position: Choose where to display the save button (ribbon, hidden, floating positions).
- **File Settings:**
  - File Name Prefix: Set a prefix to add to exported file names.
- 📂 **Default Save Location:** Set a default save location for your files or be prompted each time you save.
- 🆕 **Open After Saving:** Automatically open newly saved files in Obsidian for immediate access.

## How to Use

1. **Copy to Clipboard:**
   - Click the copy button or use the hotkey (Cmd/Ctrl+Shift+C) to copy the content of your active editor to the clipboard.
2. **Save to File:**
   - Click the save button or use the hotkey (Cmd/Ctrl+Shift+S) to save the content of your active editor to a file.
3. **Configure Your Settings:**
   - Visit **Settings > Outliner Card View Plugin** to tailor the plugin to your unique workflow.

## Installation
### From within Obsidian
1. Open Settings > Community plugins
2. Click "Browse"
3. Search for "Outliner Card View Plugin"
4. Click "Install"
5. Once installed, go back to "Community plugins" and enable "Outliner Card View Plugin"
### Manually
1. Download the latest Release from the Releases section of the GitHub repository.
2. Extract the plugin folder outliner-card-view to your Obsidian vault's plugins folder: <your_vault>/.obsidian/plugins/.
   - Note: On some machines the .obsidian folder may be hidden. On macOS you should be able to press Cmd+Shift+. to show the folder in Finder.
3. Reload Obsidian.
4. If prompted to safe mode, you can disable safe mode and enable the plugin.
5. Go to Settings > Community plugins and enable "Outliner Card View Plugin".

Enjoy enhancing your note-taking experience with the Outliner Card View Plugin!

## FAQ
### How do I change the position of the buttons?
You can change the position of the buttons in the plugin settings under "Button Settings". Choose from ribbon, hidden, or various floating positions.

### Can I remove metadata and block IDs from the copied content?
Yes, you can toggle the removal of metadata and block IDs in the plugin settings under "Content Settings".

### How do I set a default save location?
You can set a default save location in the plugin settings under "File Settings". If left empty, you will be prompted each time you save.

### Will the plugin automatically open newly saved files?
Yes, if the "Open After Saving" setting is enabled, the plugin will automatically open newly saved files in Obsidian.
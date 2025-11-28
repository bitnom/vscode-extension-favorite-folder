# Quick Folders VS Code Extension

## Overview

**Quick Folders** is a powerful productivity tool for Visual Studio Code that helps you manage and organize your frequently accessed directories. Beyond simple bookmarking, it offers a flexible system with **Virtual Folders**, **Drag-and-Drop organization**, and **Smart Sorting**, allowing you to create a custom navigation workspace tailored to your needs.

## Features

-   **📁 Add Favorite Folders:** Bookmark any directory for instant access.
-   **📂 Virtual Folders:** Create custom "Virtual Folders" to group and organize your favorites hierarchically.
-   **🖱️ Drag & Drop Organization:**
    -   Drag folders from the VS Code Explorer directly into Quick Folders.
    -   Reorder items manually by dragging them within the view.
    -   Move folders inside Virtual Folders to keep your view clean.
-   **🔃 Sorting Options:**
    -   **Manual:** Arrange items exactly how you want them.
    -   **Alphabetical:** Sort items A-Z.
    -   **Last Modified:** Automatically bring your most active projects to the top (checks inside Virtual Folders too!).
-   **⚡ Enhanced Context Menu:** Right-click items to:
    -   Reveal in Explorer / Finder.
    -   Open in Integrated Terminal.
    -   Copy Path / Relative Path.
    -   Find in Folder.
-   **🚀 Quick Access:** Instantly open folders in the current window or a new window.

## Usage

### Managing Folders
-   **Add a Folder:** Click the `+` icon in the view title or use the `Add Quick Folder` command. You can also drag a folder from the File Explorer directly into the Quick Folders view.
-   **Create a Virtual Folder:** Click the `New Folder` icon in the view title or right-click a Virtual Folder to nest one inside.
-   **Remove:** Right-click any item and select `Remove Quick Folder`.

### Sorting
Click the `Sort` icon in the Quick Folders view title to choose your preferred mode:
1.  **Manual:** Default mode. Drag items to reorder them.
2.  **Alphabetical:** Sorts by name.
3.  **Last Modified:** Sorts by the most recent file change.

## Extension Settings

This extension provides the following settings:

*   `quickFolders.expandFirstRoot`: Automatically expand the first root folder in the Quick Folders view (default: `true`).
*   `quickFolders.sortBy`: Set the default sort order (`manual`, `alphabetical`, or `lastModified`).

## Requirements

No special requirements. Works out of the box with Visual Studio Code.

## Release Notes

See `CHANGELOG.md` for details on updates and changes.

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an issue or submit a pull request.

## Support

If you encounter any problems or have suggestions, please open an issue on the repository.

---

**Enjoy a faster, more organized workflow with Quick Folders!**
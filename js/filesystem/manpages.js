export const fsManPages = {

  ls:
    "List directory contents. Usage: ls [options] [path]\n\n" +
    "    -a    include hidden entries (files starting with .)\n" +
    "    -l    long format — show permissions, size, and date\n\n" +
    "    Directories are shown in cyan, image files in amber,\n" +
    "    hidden files in grey. Append / denotes a directory.",

  dir:
    "Alias for ls. Lists directory contents in the same format.",

  cd:
    "Change the current working directory. Usage: cd [path]\n\n" +
    "    cd          return to home directory (/home/deimo)\n" +
    "    cd ~        same as above\n" +
    "    cd ..       go up one level\n" +
    "    cd /etc     navigate to an absolute path\n" +
    "    cd photos   navigate to a relative path",

  cat:
    "Display the contents of a file. Usage: cat <file>\n\n" +
    "    Text files are printed to the terminal output.\n" +
    "    Image files are rendered inline.\n" +
    "    Directories and restricted paths are not readable.",

  pwd:
    "Print the current working directory path.",

  mkdir:
    "Create a new directory. Usage: mkdir <name>\n\n" +
    "    Directories can only be created under /home/deimo/ or /tmp/.\n" +
    "    Session directories are removed on logout or reboot.",

  touch:
    "Create an empty file. Usage: touch <filename>\n\n" +
    "    Files can only be created under /home/deimo/ or /tmp/.\n" +
    "    Use nano to write content into a file after creating it.\n" +
    "    Session files are removed on logout or reboot.",

  rm:
    "Remove a file or directory. Usage: rm [-r] <target>\n\n" +
    "    -r    recursively remove a directory and its contents\n\n" +
    "    Only session-created files and directories can be removed.\n" +
    "    Static system files are protected. Use with care.",

  nano:
    "Open an in-terminal text editor. Usage: nano <filename>\n\n" +
    "    Creates the file if it does not exist.\n" +
    "    Opens existing files pre-filled with their content.\n\n" +
    "    Ctrl+S    save the file\n" +
    "    Ctrl+X    exit (prompts if there are unsaved changes)\n" +
    "    Tab       insert two spaces",

};

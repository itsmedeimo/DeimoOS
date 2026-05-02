# Changelog

This file tracks all notable changes to the project.  
Versions are listed from newest to oldest.

## v0.6.2 2026-05-02

- ASCII art banner now appears on the login screen (same logo as boot)
- Login box is centered independently; ASCII art floats above it
- Command dispatch refactored into a registry (COMMAND_REGISTRY). Adding new commands no longer requires touching the dispatcher
- `CTRL + C` now cancels blog post fetches
- Full inline documentation added across script.js and commands.js

## v0.6.1 2026-04-29

- Fake filesystem easter egg with navigation, file reading, and text editing
- Session files persist until reboot or logoff
- Tab autocomplete for paths and filenames
- Images render inline in the terminal
- Hidden man pages for filesystem commands
- Added `theme` and `themes` commands with 5 color themes: Default, Commodore 64, IBM, Dracula, and Nord

## v0.6.0 2026-04-28

- Fixed input prompt showing during command execution
- Added `snake-leaderboard` (track your high scores)
- `CTRL + C` now aborts current task and restores control
- Added tab autocomplete for existing commands
- Added man command with manual pages
- Added changelog command
- Screensaver (matrix rain) after 2 min inactivity
- Immersive reboot / logoff sequences

## v0.5.2 2026-04-27

- Persistent usernames implemented
- Visit counter per user added
- Banned username check on login
- New commands: `reboot`, `logoff`

## v0.4.0 2026-04-25

- Boot sequence + command sound effects enabled
- New command: `sudo`
- Umami Analytics integrated
- Updated ASCII art (Boot Sequence, systeminfo)

## v0.3.0 2026-04-24

- README file created
- New commands: `snake`, `matrix`
- Favicon added

## v0.2.5 2026-04-23

- New commands: `blog`, `weather`, `systeminfo`, `now`, `joke`, `quote`

## v0.2.0 2026-04-21

- Mobile support enabled
- Improved `help` command formatting
- Immersive boot sequence added
- New commands: `whoami`, `version`

### v0.1.0 2026-04-20

- Initial system structure deployed
- Available commands: `aboutme`, `contact`, `project`, `links`
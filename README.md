# MC-Vector
__Minecraft - Multi-Function Server Management Software__


## Technology Stacks
- Electron
- Node.js
- React 19
- Vite


## Languages
- Typescript
- CSS


# Tutorial - How to create a server
1. Install MC-Vector and launch the application.
2. Press “+ Add Server” to open the server creation screen.
3. Set the “Server Name,” “Software,” “Version,” “Port,” and “Memory Usage” respectively.
4. Press the “Create” button.
**Completing steps 1 through 4 above will finish creating your server!**

## Tutorial - How to Configure Server Details
This application contains the following main configuration items:
- **Dashboard**
    - Here you can check the server status, ***software in use, CPU usage, and memory usage*** in real time!
- **Console**
    - Here you can check the ***server address, status, and memory usage***!
    - Additionally, as a key feature of the console, server logs stream here.
      - Furthermore, **you can execute console commands (with administrator privileges)** by typing a command into the ``Type a command...`` field and pressing the “Send” button!
- **Users**
    - Here, you can add or remove four items:
      - Server whitelist,
      - Administrator privileges,
      - User bans (+including checking banned users),
      - User IP bans.
- **Files**
    - Here, you can create, delete, edit, and move files or folders.
    - In the Files tab, **you can create new folders and files within the current directory** by clicking the + button in the upper-left corner!
- **Plugins / Mods**
    - Here, you can install plugins and mods on your server simply by pressing the “Install” button.
    - ⚠️However, **if you have created multiple servers**, ***only the currently selected server will be installed*** when you press the “Install” button.
- **Backups**
    - Here, you can create and delete server backups, as well as restore data from backups.
    - The backup file you created is saved in the following directory:
      - For MacOS➡️ ``/Users/<username>/Library/Application Support/MC-Vector/servers/<servername>/backups``
      - For Windows➡️ ``C:\Users\<username>\AppData\Roaming\MC-Vector\servers\<servername>\backups``
        - <username> is your operating system's user ID.
        - <servername> is the name of the server you created the backup for.
- **Properties**
    - Here, you can edit **the basic settings** for your Minecraft server.
    - For example, setting items include:
      - Difficulty
      - allow-flight
      - max-players
      - whitelist [``On / Off``] etc.
- **General Settings**
    - Here, you can change the settings configured when creating the server later!
    - List of configurable items:
      - Server name
      - Software
      - Version
      - Memory usage
      - Port number
      - Java version
      - ***Port fowarding elimination feature***
        - For detailed setup instructions, press the “❓️Connection Guide” button.
- **Proxy Network**
    - ***Here, you can easily set up a proxy server!***
    - For detailed setup instructions, click the “See Detailed Setup Guide” button.


## License
This project is licensed under the MIT License - see the LICENSE file for details.
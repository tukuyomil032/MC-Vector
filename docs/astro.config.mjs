import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    starlight({
      title: "MC-Vector",
      description: "Minecraft server management desktop app",
      defaultLocale: "en",
      sidebar: [
        {
          label: "Guide",
          items: [
            {
              label: "Getting Started",
              items: [
                {
                  label: "Installation",
                  slug: "guide/getting-started/installation",
                },
                {
                  label: "Create Your First Server",
                  slug: "guide/getting-started/server-creation",
                },
              ],
            },
            {
              label: "Features",
              items: [
                {
                  label: "Server Lifecycle",
                  slug: "guide/features/server-lifecycle",
                },
                {
                  label: "Plugins & Mods",
                  slug: "guide/features/plugins-mods",
                },
                {
                  label: "Backup & Restore",
                  slug: "guide/features/backup-restore",
                },
                {
                  label: "File Manager",
                  slug: "guide/features/file-manager",
                },
                {
                  label: "Console & Logs",
                  slug: "guide/features/console-logs",
                },
              ],
            },
            {
              label: "Configuration",
              items: [
                {
                  label: "General Settings",
                  slug: "guide/configuration/general-settings",
                },
                {
                  label: "Server Properties",
                  slug: "guide/configuration/server-properties",
                },
                { label: "Theme", slug: "guide/configuration/theme" },
              ],
            },
            {
              label: "Network",
              items: [
                { label: "ngrok Tunnel", slug: "guide/network/ngrok" },
                { label: "Velocity Proxy", slug: "guide/network/velocity" },
              ],
            },
            {
              label: "Troubleshooting",
              items: [
                {
                  label: "Common Errors",
                  slug: "guide/troubleshooting/common-errors",
                },
                {
                  label: "Performance",
                  slug: "guide/troubleshooting/performance",
                },
              ],
            },
          ],
        },
        {
          label: "Developer",
          badge: { text: "Developer", variant: "note" },
          items: [
            { label: "Environment Setup", slug: "dev/setup" },
            { label: "Architecture", slug: "dev/architecture" },
          ],
        },
      ],
      customCss: ["./src/styles/custom.css"],
      social: {
        github: "https://github.com/tukuyomil032/mc-vector",
      },
    }),
  ],
});

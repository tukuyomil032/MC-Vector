{
  description = "MC-Vector - Minecraft Server Management Desktop App";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        # Rust toolchain with specific version
        rustToolchain = pkgs.rust-bin.stable."1.77.2".default.override {
          extensions = [ "rust-src" "rust-analyzer" ];
        };

        # Common dependencies for all platforms
        commonBuildInputs = with pkgs; [
          # Node.js ecosystem
          nodejs_22
          nodePackages.pnpm

          # Rust toolchain
          rustToolchain

          # Tauri dependencies
          pkg-config
          openssl

          # Linters and formatters
          python311Packages.yamllint

          # Task runners
          gnumake
          just

          # Development utilities
          git
          curl
        ];

        # Platform-specific dependencies
        platformBuildInputs =
          if pkgs.stdenv.isDarwin then
            with pkgs.darwin.apple_sdk.frameworks; [
              Security
              CoreServices
              CoreFoundation
              Foundation
              AppKit
              WebKit
              Cocoa
            ]
          else
            with pkgs; [
              webkitgtk
              gtk3
              cairo
              gdk-pixbuf
              glib
              dbus
              libsoup
            ];

      in
      {
        # Development shell
        devShells.default = pkgs.mkShell {
          name = "mc-vector-dev";

          buildInputs = commonBuildInputs ++ platformBuildInputs;

          shellHook = ''
            echo "🚀 MC-Vector Development Environment (Nix Flakes)"
            echo ""
            echo "Node.js:  $(node --version)"
            echo "pnpm:     $(pnpm --version)"
            echo "Rust:     $(rustc --version)"
            echo "Cargo:    $(cargo --version)"
            echo ""
            echo "Available commands:"
            echo "  make help     - Show all Makefile targets"
            echo "  just --list   - Show all justfile recipes"
            echo ""
            echo "Quick start:"
            echo "  make install     - Install dependencies"
            echo "  make tauri-dev   - Start development server"
            echo ""
          '';

          # Environment variables
          RUST_SRC_PATH = "${rustToolchain}/lib/rustlib/src/rust/library";
          RUST_BACKTRACE = "1";
        };

        # Package definitions (for future binary distribution)
        packages = {
          default = pkgs.stdenv.mkDerivation {
            pname = "mc-vector";
            version = "2.0.48";

            src = ./.;

            nativeBuildInputs = commonBuildInputs;
            buildInputs = platformBuildInputs;

            buildPhase = ''
              pnpm install --frozen-lockfile
              pnpm tauri:build
            '';

            installPhase = ''
              mkdir -p $out/bin
              # Platform-specific installation (to be completed)
              # macOS: copy .app bundle
              # Linux: copy AppImage or deb/rpm
            '';

            meta = with pkgs.lib; {
              description = "Minecraft Server Management Desktop App";
              homepage = "https://github.com/tukuyomil032/MC-Vector";
              license = licenses.mit;
              platforms = platforms.unix;
            };
          };
        };

        # Apps for `nix run`
        apps = {
          dev = {
            type = "app";
            program = "${pkgs.writeShellScript "mc-vector-dev" ''
              ${pkgs.nodePackages.pnpm}/bin/pnpm tauri:dev
            ''}";
          };
        };
      }
    );
}

# MC-Vector Development Shell
# Provides a reproducible development environment with all required tools

{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  name = "mc-vector-dev";

  buildInputs = with pkgs; [
    # Node.js ecosystem
    nodejs_22
    nodePackages.pnpm

    # Rust toolchain
    rustc
    cargo
    rustfmt
    rust-analyzer

    # Tauri dependencies
    pkg-config
    openssl
    
    # Platform-specific dependencies
    (if stdenv.isDarwin then [
      darwin.apple_sdk.frameworks.Security
      darwin.apple_sdk.frameworks.CoreServices
      darwin.apple_sdk.frameworks.CoreFoundation
      darwin.apple_sdk.frameworks.Foundation
      darwin.apple_sdk.frameworks.AppKit
      darwin.apple_sdk.frameworks.WebKit
      darwin.apple_sdk.frameworks.Cocoa
    ] else [
      # Linux dependencies
      webkitgtk
      gtk3
      cairo
      gdk-pixbuf
      glib
      dbus
      libsoup
    ])

    # Linters and formatters
    python311Packages.yamllint
    
    # Task runners
    gnumake
    just

    # Development utilities
    git
    curl
  ];

  shellHook = ''
    echo "🚀 MC-Vector Development Environment"
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
    echo "  make install  - Install dependencies"
    echo "  make tauri-dev - Start development server"
    echo ""
  '';

  # Environment variables
  RUST_SRC_PATH = "${pkgs.rust.packages.stable.rustPlatform.rustLibSrc}";
  
  # Enable Rust backtrace in development
  RUST_BACKTRACE = "1";
}

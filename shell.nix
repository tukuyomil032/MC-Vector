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

    # Linters and formatters
    python3Packages.yamllint

    # Task runners
    gnumake
    just

    # Development utilities
    git
    curl
  ] ++ lib.optionals stdenv.isDarwin (with darwin.apple_sdk.frameworks; [
    Security
    CoreServices
    CoreFoundation
    Foundation
    AppKit
    WebKit
    Cocoa
  ]) ++ lib.optionals (!stdenv.isDarwin) [
    # Linux dependencies
    webkitgtk
    gtk3
    cairo
    gdk-pixbuf
    glib
    dbus
    libsoup
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
  RUST_SRC_PATH = "${pkgs.rustPlatform.rustLibSrc}";
  
  # Enable Rust backtrace in development
  RUST_BACKTRACE = "1";
}
